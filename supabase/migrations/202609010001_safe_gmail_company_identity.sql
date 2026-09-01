-- Safe company identity normalization for Gmail onboarding. This intentionally
-- performs exact normalized matching only; it never treats one group company
-- as another merely because one name contains the other.
create or replace function public.normalize_company_match(value text)
returns text language sql immutable parallel safe as $$
  select lower(
    regexp_replace(
      regexp_replace(
        translate(coalesce(value, ''), '　・･,，.．:：;；「」『』"''“”‘’', ''),
        '(株式会社|有限会社|合同会社|（株）|\\(株\\)|㈱)', '', 'g'
      ),
      '\\s+', '', 'g'
    )
  )
$$;

-- A private, one-shot snapshot is retained in the production database before
-- reconciliation. It is not exposed to clients or committed with any personal data.
create table if not exists public.company_reconciliation_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_key text not null,
  app_data jsonb not null,
  monitoring_targets jsonb not null default '[]'::jsonb,
  collector_findings jsonb not null default '[]'::jsonb,
  gmail_backfill_requests jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, operation_key)
);
alter table public.company_reconciliation_backups enable row level security;
revoke all on public.company_reconciliation_backups from public, anon, authenticated;
grant all on public.company_reconciliation_backups to service_role;

-- Prevent a new onboarding row whenever an existing AppData company has the
-- same safe normalized identity, even if a monitoring-target sync is delayed.
create or replace function public.auto_onboard_strong_gmail_companies(p_user_id uuid, p_limit integer default 100)
returns table(created_companies integer, ambiguous_candidates integer)
language plpgsql security definer set search_path = public as $$
declare f record; app jsonb; candidate_id text; target_id uuid; matching_count integer;
  company_name text; sender_domain text; safe_mypage text; company_json jsonb;
  created_count integer := 0; ambiguous_count integer := 0; app_match_count integer;
begin
  for f in select * from public.collector_findings
    where user_id = p_user_id and source_type = 'gmail' and monitoring_target_id is null
      and status in ('new','needs_review') and confidence >= .92
      and finding_type in ('es_deadline','web_test_deadline','interview_scheduled','interview_reservation_required','event_scheduled','document_required','entry_completed','es_submitted','web_test_completed','offer','rejection','mypage_created')
      and coalesce(payload->>'companyName','') <> ''
    order by observed_at asc limit greatest(1, least(p_limit, 500))
  loop
    company_name := left(trim(f.payload->>'companyName'), 120);
    sender_domain := lower(coalesce(substring(f.payload->>'sender' from '@([A-Za-z0-9.-]+)'), ''));
    safe_mypage := case when coalesce(f.payload->>'myPageUrl','') ~ '^https://' then f.payload->>'myPageUrl' else null end;
    select count(*) into matching_count from public.monitoring_targets t
      where t.user_id = p_user_id and public.normalize_company_match(t.canonical_name) = public.normalize_company_match(company_name);
    if matching_count > 1 then
      update public.collector_findings set status = 'needs_review', triage_action = 'manual_review', triage_reason = 'ambiguous_auto_onboarding', review_reason = 'ambiguous_auto_onboarding', updated_at = now() where id = f.id;
      ambiguous_count := ambiguous_count + 1; continue;
    end if;
    if matching_count = 1 then
      select id into target_id from public.monitoring_targets where user_id = p_user_id and public.normalize_company_match(canonical_name) = public.normalize_company_match(company_name) limit 1;
      update public.collector_findings set monitoring_target_id = target_id, company = company_name, updated_at = now() where id = f.id;
      continue;
    end if;
    select app_data into app from public.user_app_data where user_id = p_user_id for update;
    if app is null then continue; end if;
    select count(*) into app_match_count from jsonb_array_elements(coalesce(app->'userCompanies','[]'::jsonb)) c
      where public.normalize_company_match(c->>'userEnteredName') = public.normalize_company_match(company_name);
    if app_match_count = 1 then
      candidate_id := (select c->>'id' from jsonb_array_elements(coalesce(app->'userCompanies','[]'::jsonb)) c where public.normalize_company_match(c->>'userEnteredName') = public.normalize_company_match(company_name) limit 1);
      insert into public.monitoring_targets(user_id,candidate_company_id,canonical_name,aliases,mypage_url,sender_domains,status,work_history_eligibility,enabled)
        values(p_user_id,candidate_id,company_name,array[company_name],safe_mypage,case when sender_domain = '' then '{}'::text[] else array[sender_domain] end,'watch','needs_review',true)
        on conflict (user_id,candidate_company_id) do update set aliases=array(select distinct unnest(public.monitoring_targets.aliases || excluded.aliases)), sender_domains=array(select distinct unnest(public.monitoring_targets.sender_domains || excluded.sender_domains)), mypage_url=coalesce(public.monitoring_targets.mypage_url, excluded.mypage_url), updated_at=now()
        returning id into target_id;
      update public.collector_findings set monitoring_target_id=target_id, company=company_name, updated_at=now() where id=f.id;
      continue;
    elsif app_match_count > 1 then
      update public.collector_findings set status='needs_review', triage_action='manual_review', triage_reason='ambiguous_appdata_company_identity', review_reason='ambiguous_appdata_company_identity', updated_at=now() where id=f.id;
      ambiguous_count := ambiguous_count + 1; continue;
    end if;
    candidate_id := 'gmail-onboard-' || replace(f.id::text, '-', '');
    company_json := jsonb_build_object('id',candidate_id,'masterCompanyId',null,'userEnteredName',company_name,'role','','applicationCategory','Gmail自動検出','manualPriority','C','interest',0,'applicationStatus','検討中','myPageStatus',case when safe_mypage is null then '未開設' else '開設済み' end,'applicationUrl','', 'selectionPhase','considering','selectionState','active','closeReason',null,'offerDecision',null,'selectionStageUpdatedAt',now()::text,'lastCompanyInteractionAt',now()::text,'memo','Gmailの明示的な採用連絡から安全に登録。必要に応じて内容を確認してください。','watchEnabled',true,'events','[]'::jsonb,'createdAt',now()::text,'updatedAt',now()::text);
    app := jsonb_set(app, '{userCompanies}', coalesce(app->'userCompanies','[]'::jsonb) || jsonb_build_array(company_json));
    update public.user_app_data set app_data = app, revision = revision + 1, updated_at = now() where user_id = p_user_id;
    insert into public.monitoring_targets(user_id,candidate_company_id,canonical_name,aliases,mypage_url,sender_domains,status,work_history_eligibility,enabled)
      values(p_user_id,candidate_id,company_name,array[company_name],safe_mypage,case when sender_domain = '' then '{}'::text[] else array[sender_domain] end,'watch','needs_review',true) returning id into target_id;
    update public.collector_findings set monitoring_target_id = target_id, company = company_name, status = 'approved', triage_action = 'auto_approved', triage_reason = 'strong_sender_legal_name_and_recruiting_event', triage_confidence = confidence, triaged_at = now(), updated_at = now() where id = f.id;
    insert into public.gmail_backfill_requests(user_id,monitoring_target_id) values(p_user_id,target_id) on conflict do nothing;
    created_count := created_count + 1;
  end loop;
  created_companies := created_count; ambiguous_candidates := ambiguous_count; return next;
end $$;
revoke all on function public.auto_onboard_strong_gmail_companies(uuid, integer) from public, anon, authenticated;
grant execute on function public.auto_onboard_strong_gmail_companies(uuid, integer) to service_role;
