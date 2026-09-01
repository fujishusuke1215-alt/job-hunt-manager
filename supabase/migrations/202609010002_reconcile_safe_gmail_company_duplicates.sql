-- Reconciles only an exact, safe duplicate shape: one pre-existing company and
-- one gmail-onboard-* company with the same normalized identity. Anything
-- else is reported as manual_review and left untouched.
create or replace function public.reconcile_safe_gmail_company_duplicates(
  p_user_id uuid,
  p_apply boolean default false
)
returns table(normalized_name text, survivor_name text, duplicate_name text, action text)
language plpgsql security definer set search_path = public as $$
declare
  group_row record;
  app jsonb;
  survivor jsonb;
  duplicate jsonb;
  merged_company jsonb;
  survivor_id text;
  duplicate_id text;
  survivor_target public.monitoring_targets%rowtype;
  duplicate_target public.monitoring_targets%rowtype;
  survivor_target_found boolean;
  duplicate_target_found boolean;
  request_conflict boolean;
  state_conflict boolean;
  backup_key constant text := 'safe-gmail-company-duplicate-reconciliation-v1';
begin
  select app_data into app from public.user_app_data where user_id = p_user_id for update;
  if app is null then
    raise exception 'app_data_not_found';
  end if;

  if p_apply then
    insert into public.company_reconciliation_backups(user_id, operation_key, app_data, monitoring_targets, collector_findings, gmail_backfill_requests)
    select p_user_id, backup_key, app,
      coalesce((select jsonb_agg(to_jsonb(t)) from public.monitoring_targets t where t.user_id=p_user_id), '[]'::jsonb),
      coalesce((select jsonb_agg(to_jsonb(f)) from public.collector_findings f where f.user_id=p_user_id), '[]'::jsonb),
      coalesce((select jsonb_agg(to_jsonb(r)) from public.gmail_backfill_requests r where r.user_id=p_user_id), '[]'::jsonb)
    on conflict (user_id, operation_key) do nothing;
  end if;

  for group_row in
    with companies as (
      select c.value as company, c.value->>'id' as company_id, c.value->>'userEnteredName' as company_name,
        public.normalize_company_match(c.value->>'userEnteredName') as normalized
      from jsonb_array_elements(coalesce(app->'userCompanies', '[]'::jsonb)) c
    ), groups as (
      select normalized,
        count(*) as company_count,
        count(*) filter (where company_id like 'gmail-onboard-%') as gmail_count,
        count(*) filter (where company_id not like 'gmail-onboard-%') as survivor_count,
        min(company_id) filter (where company_id like 'gmail-onboard-%') as duplicate_id,
        min(company_id) filter (where company_id not like 'gmail-onboard-%') as survivor_id,
        string_agg(company_name, ' | ' order by case when company_id like 'gmail-onboard-%' then 1 else 0 end) as names
      from companies where normalized <> '' group by normalized having count(*) > 1
    )
    select * from groups order by normalized
  loop
    normalized_name := group_row.normalized;
    survivor_name := null;
    duplicate_name := null;
    if group_row.company_count <> 2 or group_row.gmail_count <> 1 or group_row.survivor_count <> 1 then
      action := 'manual_review'; return next; continue;
    end if;

    survivor_id := group_row.survivor_id;
    duplicate_id := group_row.duplicate_id;
    select c.value into survivor from jsonb_array_elements(app->'userCompanies') c where c.value->>'id'=survivor_id;
    select c.value into duplicate from jsonb_array_elements(app->'userCompanies') c where c.value->>'id'=duplicate_id;
    survivor_name := survivor->>'userEnteredName';
    duplicate_name := duplicate->>'userEnteredName';

    select * into survivor_target from public.monitoring_targets where user_id=p_user_id and candidate_company_id=survivor_id limit 1;
    survivor_target_found := found;
    select * into duplicate_target from public.monitoring_targets where user_id=p_user_id and candidate_company_id=duplicate_id limit 1;
    duplicate_target_found := found;

    request_conflict := false;
    state_conflict := false;
    if survivor_target_found and duplicate_target_found then
      select exists(
        select 1 from public.gmail_backfill_requests a join public.gmail_backfill_requests b
          on a.user_id=b.user_id and a.status=b.status
        where a.user_id=p_user_id and a.monitoring_target_id=survivor_target.id and b.monitoring_target_id=duplicate_target.id
      ) into request_conflict;
      select exists(
        select 1 from public.collector_state a join public.collector_state b
          on a.user_id=b.user_id and a.collector_type=b.collector_type and a.target_key=b.target_key
        where a.user_id=p_user_id and a.collector_type='web'
          and a.target_key=survivor_target.id::text and b.target_key=duplicate_target.id::text
      ) into state_conflict;
    end if;
    if request_conflict or state_conflict then
      action := 'manual_review'; return next; continue;
    end if;
    if not p_apply then
      action := 'ready_to_merge'; return next; continue;
    end if;

    -- Preserve every event while preferring the pre-existing company's copy
    -- when an explicit source message identifies the same event.
    merged_company := survivor || jsonb_build_object(
      'events', coalesce((
        select jsonb_agg(event order by priority, position)
        from (
          select event, priority, position,
            row_number() over (partition by coalesce(nullif(event->>'sourceMessageId',''), nullif(event->>'sourceRfcMessageId',''), event->>'id') order by priority, position) as rn
          from (
            select e as event, 0 as priority, ordinality as position from jsonb_array_elements(coalesce(survivor->'events','[]'::jsonb)) with ordinality x(e, ordinality)
            union all
            select e as event, 1 as priority, ordinality as position from jsonb_array_elements(coalesce(duplicate->'events','[]'::jsonb)) with ordinality x(e, ordinality)
          ) source_events
        ) deduped where rn=1
      ), '[]'::jsonb),
      'applicationUrl', coalesce(nullif(survivor->>'applicationUrl',''), nullif(duplicate->>'applicationUrl',''), ''),
      'memo', coalesce(nullif(survivor->>'memo',''), nullif(duplicate->>'memo',''), ''),
      'updatedAt', now()::text
    );
    app := jsonb_set(app, '{userCompanies}', coalesce((
      select jsonb_agg(case when c.value->>'id'=survivor_id then merged_company else c.value end order by c.ordinality)
      from jsonb_array_elements(app->'userCompanies') with ordinality c(value, ordinality)
      where c.value->>'id' <> duplicate_id
    ), '[]'::jsonb));
    app := jsonb_set(app, '{evaluations}', coalesce((
      select jsonb_agg(case when e.value->>'userCompanyId'=duplicate_id then jsonb_set(e.value, '{userCompanyId}', to_jsonb(survivor_id)) else e.value end)
      from jsonb_array_elements(coalesce(app->'evaluations','[]'::jsonb)) e
      where not (e.value->>'userCompanyId'=duplicate_id and exists (
        select 1 from jsonb_array_elements(coalesce(app->'evaluations','[]'::jsonb)) s
        where s->>'userCompanyId'=survivor_id and s->>'scoringProfileId'=e.value->>'scoringProfileId'
      ))
    ), '[]'::jsonb));
    app := jsonb_set(app, '{researchFacts}', coalesce((select jsonb_agg(case when x.value->>'userCompanyId'=duplicate_id then jsonb_set(x.value, '{userCompanyId}', to_jsonb(survivor_id)) else x.value end) from jsonb_array_elements(coalesce(app->'researchFacts','[]'::jsonb)) x), '[]'::jsonb));
    app := jsonb_set(app, '{watchFindings}', coalesce((select jsonb_agg(case when x.value->>'userCompanyId'=duplicate_id then jsonb_set(x.value, '{userCompanyId}', to_jsonb(survivor_id)) else x.value end) from jsonb_array_elements(coalesce(app->'watchFindings','[]'::jsonb)) x), '[]'::jsonb));
    update public.user_app_data set app_data=app, revision=revision+1, updated_at=now() where user_id=p_user_id;

    if duplicate_target_found and survivor_target_found then
      update public.monitoring_targets set
        aliases=array(select distinct unnest(coalesce(survivor_target.aliases,'{}'::text[]) || coalesce(duplicate_target.aliases,'{}'::text[]))),
        sender_domains=array(select distinct unnest(coalesce(survivor_target.sender_domains,'{}'::text[]) || coalesce(duplicate_target.sender_domains,'{}'::text[]))),
        official_url=coalesce(survivor_target.official_url, duplicate_target.official_url),
        mypage_url=coalesce(survivor_target.mypage_url, duplicate_target.mypage_url),
        mypage_login_id=coalesce(survivor_target.mypage_login_id, duplicate_target.mypage_login_id), updated_at=now()
      where id=survivor_target.id;
      update public.collector_findings set monitoring_target_id=survivor_target.id, company=survivor_name, updated_at=now() where monitoring_target_id=duplicate_target.id;
      update public.gmail_backfill_requests set monitoring_target_id=survivor_target.id where user_id=p_user_id and monitoring_target_id=duplicate_target.id;
      update public.collector_state set target_key=survivor_target.id::text, updated_at=now() where user_id=p_user_id and collector_type='web' and target_key=duplicate_target.id::text;
      delete from public.monitoring_targets where id=duplicate_target.id;
    elsif duplicate_target_found then
      update public.monitoring_targets set candidate_company_id=survivor_id, canonical_name=survivor_name,
        aliases=array(select distinct unnest(coalesce(aliases,'{}'::text[]) || array[survivor_name])), updated_at=now()
      where id=duplicate_target.id;
      update public.collector_findings set company=survivor_name, updated_at=now() where monitoring_target_id=duplicate_target.id;
    end if;
    action := 'merged'; return next;
  end loop;
end $$;
revoke all on function public.reconcile_safe_gmail_company_duplicates(uuid, boolean) from public, anon, authenticated;
grant execute on function public.reconcile_safe_gmail_company_duplicates(uuid, boolean) to service_role;
