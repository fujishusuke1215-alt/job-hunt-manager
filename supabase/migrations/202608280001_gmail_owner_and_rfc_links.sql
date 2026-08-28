-- Gmail collector ownership is intentionally separate from the Supabase admin
-- login.  This migration only records the verified owner account state and the
-- RFC Message-ID required for stable Gmail search links.
alter table public.collector_findings
  add column if not exists rfc_message_id text;

create index if not exists collector_findings_user_rfc_message_id_idx
  on public.collector_findings (user_id, rfc_message_id)
  where rfc_message_id is not null;

-- Existing rows retain their original Gmail IDs.  The RFC ID stays in the
-- private collector table and is never copied into the public demo payload.
comment on column public.collector_findings.rfc_message_id is
  'Private RFC Message-ID used to open the owner Gmail message via rfc822msgid search.';

create or replace function public.attach_collector_rfc_message_ids(p_user_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare app jsonb; changed integer := 0;
begin
  select app_data into app from public.user_app_data where user_id = p_user_id for update;
  if app is null then return 0; end if;
  app := jsonb_set(app, '{userCompanies}', (
    select coalesce(jsonb_agg(
      jsonb_set(company, '{events}', (
        select coalesce(jsonb_agg(
          case when coalesce(event->>'sourceRfcMessageId', '') = '' and finding.rfc_message_id is not null
            then event || jsonb_build_object('sourceRfcMessageId', finding.rfc_message_id)
            else event end
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(company->'events', '[]'::jsonb)) event
        left join public.collector_findings finding
          on finding.user_id = p_user_id
         and finding.source_external_id = event->>'sourceMessageId'
      )
    ), '[]'::jsonb)
    from jsonb_array_elements(app->'userCompanies') company
  ));
  update public.user_app_data set app_data = app, revision = revision + 1, updated_at = now() where user_id = p_user_id;
  get diagnostics changed = row_count;
  return changed;
end $$;
revoke all on function public.attach_collector_rfc_message_ids(uuid) from public, anon, authenticated;
grant execute on function public.attach_collector_rfc_message_ids(uuid) to service_role;

-- New companies are created only from an explicit company legal name in the
-- sender display name plus an actionable recruiting event. Marketing, scouts,
-- broad event mail, and every ambiguous match remain in the review inbox.
create or replace function public.auto_onboard_strong_gmail_companies(p_user_id uuid, p_limit integer default 100)
returns table(created_companies integer, ambiguous_candidates integer)
language plpgsql security definer set search_path = public as $$
declare f record; app jsonb; candidate_id text; target_id uuid; matching_count integer;
  company_name text; sender_domain text; safe_mypage text; company_json jsonb;
  created_count integer := 0; ambiguous_count integer := 0;
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
      ambiguous_count := ambiguous_count + 1;
      continue;
    end if;
    if matching_count = 1 then
      select id into target_id from public.monitoring_targets where user_id = p_user_id and public.normalize_company_match(canonical_name) = public.normalize_company_match(company_name) limit 1;
      update public.collector_findings set monitoring_target_id = target_id, company = company_name, updated_at = now() where id = f.id;
      continue;
    end if;
    select app_data into app from public.user_app_data where user_id = p_user_id for update;
    if app is null then continue; end if;
    candidate_id := 'gmail-onboard-' || replace(f.id::text, '-', '');
    company_json := jsonb_build_object('id',candidate_id,'masterCompanyId',null,'userEnteredName',company_name,'role','','applicationCategory','Gmail自動検出','manualPriority','C','interest',0,'applicationStatus','検討中','myPageStatus',case when safe_mypage is null then '未開設' else '開設済み' end,'applicationUrl','', 'selectionPhase','considering','selectionState','active','closeReason',null,'offerDecision',null,'selectionStageUpdatedAt',now()::text,'lastCompanyInteractionAt',now()::text,'memo','Gmailの明示的な採用連絡から安全に登録。必要に応じて内容を確認してください。','watchEnabled',true,'events','[]'::jsonb,'createdAt',now()::text,'updatedAt',now()::text);
    app := jsonb_set(app, '{userCompanies}', coalesce(app->'userCompanies','[]'::jsonb) || jsonb_build_array(company_json));
    update public.user_app_data set app_data = app, revision = revision + 1, updated_at = now() where user_id = p_user_id;
    insert into public.monitoring_targets(user_id,candidate_company_id,canonical_name,aliases,mypage_url,sender_domains,status,work_history_eligibility,enabled)
      values(p_user_id,candidate_id,company_name,array[company_name],safe_mypage,case when sender_domain = '' then '{}'::text[] else array[sender_domain] end,'watch','needs_review',true)
      returning id into target_id;
    update public.collector_findings set monitoring_target_id = target_id, company = company_name, status = 'approved', triage_action = 'auto_approved', triage_reason = 'strong_sender_legal_name_and_recruiting_event', triage_confidence = confidence, triaged_at = now(), updated_at = now() where id = f.id;
    insert into public.gmail_backfill_requests(user_id,monitoring_target_id) values(p_user_id,target_id) on conflict do nothing;
    created_count := created_count + 1;
  end loop;
  created_companies := created_count; ambiguous_candidates := ambiguous_count; return next;
end $$;
revoke all on function public.auto_onboard_strong_gmail_companies(uuid, integer) from public, anon, authenticated;
grant execute on function public.auto_onboard_strong_gmail_companies(uuid, integer) to service_role;
