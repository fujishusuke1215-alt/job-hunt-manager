-- Canonical, evidence-backed actions produced by the owner Gmail collector.
-- Private login IDs are intentionally kept outside the public AppData JSON.
alter table public.monitoring_targets
  add column if not exists mypage_login_id text;

alter table public.collector_findings
  add column if not exists action_type text,
  add column if not exists action_due_at timestamptz,
  add column if not exists action_starts_at timestamptz,
  add column if not exists action_ends_at timestamptz,
  add column if not exists source_thread_id text;

create table if not exists public.gmail_backfill_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  monitoring_target_id uuid not null references public.monitoring_targets(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  requested_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
  last_error text, result_count integer not null default 0 check (result_count >= 0),
  unique (user_id, monitoring_target_id, status) deferrable initially immediate
);
alter table public.gmail_backfill_requests enable row level security;
create policy "gmail_backfill_requests owner" on public.gmail_backfill_requests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.queue_gmail_backfill(p_candidate_company_id text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare target_id uuid; request_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select id into target_id from public.monitoring_targets
    where user_id = auth.uid() and candidate_company_id = p_candidate_company_id;
  if target_id is null then raise exception 'monitoring_target_not_found'; end if;
  update public.gmail_backfill_requests set status = 'completed', completed_at = now()
    where user_id = auth.uid() and monitoring_target_id = target_id and status in ('queued','running');
  insert into public.gmail_backfill_requests(user_id, monitoring_target_id)
    values (auth.uid(), target_id) returning id into request_id;
  return request_id;
end $$;

revoke all on function public.queue_gmail_backfill(text) from public;
grant execute on function public.queue_gmail_backfill(text) to authenticated;

-- The JSON event remains the application source of truth.  The extra fields are
-- optional so historical personal data stays valid while new automatic actions
-- retain their evidence, source links, and canonical Japan-time timestamps.
create or replace function public.apply_auto_collector_events(p_user_id uuid, p_limit integer default 500)
returns table(created_events integer, skipped_events integer)
language plpgsql security definer set search_path = public as $$
declare
  finding record; app jsonb; company_index integer; events jsonb; event_json jsonb;
  created_count integer := 0; skipped_count integer := 0;
  event_type text; event_status text; scheduled_at text; action_kind text;
begin
  for finding in
    select f.id, f.source_timestamp, f.observed_at, f.finding_type, f.payload,
      f.source_external_id, f.source_thread_id, f.source_url, f.evidence_excerpt,
      f.action_type, f.action_due_at, f.action_starts_at, f.action_ends_at,
      f.confidence, t.candidate_company_id, t.id as monitoring_target_id
    from public.collector_findings f join public.monitoring_targets t on t.id = f.monitoring_target_id
    where f.user_id = p_user_id and f.status = 'approved' and f.auto_event_id is null
      and coalesce(f.confidence, 0) >= .85
    order by f.observed_at asc limit greatest(1, least(p_limit, 1000))
  loop
    -- A matching recruiting/MyPage HTTPS URL may fill a blank value, but never
    -- overwrites an existing URL supplied by the user or a prior verification.
    if coalesce(finding.payload->>'myPageUrl', '') ~ '^https://' then
      update public.monitoring_targets set mypage_url = coalesce(mypage_url, finding.payload->>'myPageUrl'), updated_at = now()
        where id = finding.monitoring_target_id;
    end if;
    action_kind := coalesce(finding.action_type, finding.payload->>'actionType');
    if finding.finding_type in ('entry_completed','entry_receipt','application_completed') then
      event_type := 'エントリー'; event_status := '完了'; scheduled_at := coalesce(finding.source_timestamp, finding.observed_at)::text;
    elsif finding.finding_type in ('es_submitted','document_submitted') then
      event_type := 'ES'; event_status := '完了'; scheduled_at := coalesce(finding.source_timestamp, finding.observed_at)::text;
    elsif finding.finding_type = 'web_test_completed' then
      event_type := 'Webテスト'; event_status := '完了'; scheduled_at := coalesce(finding.source_timestamp, finding.observed_at)::text;
    elsif finding.finding_type in ('rejection','offer','result_notice') then
      event_type := 'その他'; event_status := case when finding.finding_type = 'rejection' then '見送り' else '結果待ち' end; scheduled_at := coalesce(finding.source_timestamp, finding.observed_at)::text;
    elsif action_kind in ('ES_DEADLINE','WEB_TEST_DEADLINE','INTERVIEW_RESERVATION_REQUIRED','DOCUMENT_REQUIRED','INTERVIEW_SCHEDULED','EVENT_SCHEDULED','EVENT_INVITATION')
      and coalesce(finding.action_due_at, finding.action_starts_at) is not null then
      event_type := case when action_kind like 'WEB_TEST%' then 'Webテスト'
        when action_kind like 'INTERVIEW%' then '面接'
        when action_kind like 'EVENT%' then '説明会'
        when action_kind like 'DOCUMENT%' or action_kind like 'ES%' then 'ES' else 'その他' end;
      event_status := '予定'; scheduled_at := coalesce(finding.action_starts_at, finding.action_due_at)::text;
    else
      update public.collector_findings set auto_event_id = 'not-actionable', updated_at = now() where id = finding.id;
      skipped_count := skipped_count + 1; continue;
    end if;
    select app_data into app from public.user_app_data where user_id = p_user_id for update;
    select ordinality - 1 into company_index from jsonb_array_elements(app->'userCompanies') with ordinality item(value, ordinality)
      where item.value->>'id' = finding.candidate_company_id limit 1;
    if company_index is null then skipped_count := skipped_count + 1; continue; end if;
    events := coalesce(app #> array['userCompanies', company_index::text, 'events'], '[]'::jsonb);
    if events @> jsonb_build_array(jsonb_build_object('sourceMessageId', finding.source_external_id))
      or exists (select 1 from jsonb_array_elements(events) e where e->>'autoActionType' = action_kind
        and coalesce(e->>'dueAt', e->>'startsAt', e->>'scheduledAt') = scheduled_at) then
      update public.collector_findings set auto_event_id = 'deduplicated', updated_at = now() where id = finding.id;
      skipped_count := skipped_count + 1; continue;
    end if;
    event_json := jsonb_strip_nulls(jsonb_build_object(
      'id', 'collector-event-' || finding.id, 'type', event_type,
      'title', left(coalesce(finding.payload->>'actionTitle', finding.payload->>'subject', finding.evidence_excerpt, event_type), 240),
      'scheduledAt', scheduled_at, 'status', event_status, 'location', '',
      'memo', 'Collector自動反映（根拠ID: ' || coalesce(finding.source_external_id, finding.id::text) || '）',
      'autoActionType', action_kind, 'dueAt', finding.action_due_at, 'startsAt', finding.action_starts_at,
      'endsAt', finding.action_ends_at, 'sourceMessageId', finding.source_external_id,
      'sourceThreadId', finding.source_thread_id, 'sourceSubject', finding.payload->>'subject',
      'sourceUrl', finding.source_url, 'evidenceExcerpt', finding.evidence_excerpt,
      'myPageUrl', finding.payload->>'myPageUrl', 'autoProcessed', true, 'confidence', finding.confidence));
    app := jsonb_set(app, array['userCompanies', company_index::text, 'events'], events || jsonb_build_array(event_json));
    update public.user_app_data set app_data = app, revision = revision + 1, updated_at = now() where user_id = p_user_id;
    update public.collector_findings set auto_event_id = 'collector-event-' || finding.id, updated_at = now() where id = finding.id;
    created_count := created_count + 1;
  end loop;
  created_events := created_count; skipped_events := skipped_count; return next;
end $$;
revoke all on function public.apply_auto_collector_events(uuid, integer) from public, anon, authenticated;
grant execute on function public.apply_auto_collector_events(uuid, integer) to service_role;

create or replace function public.reprocess_collector_findings(p_user_id uuid, p_limit integer default 1000)
returns jsonb language plpgsql security definer set search_path = public as $$
declare triage jsonb; confirmed jsonb; events jsonb;
begin
  update public.collector_findings set status = 'new', auto_event_id = null, triaged_at = null,
    triage_action = 'manual_review', triage_reason = null, triage_confidence = null, updated_at = now()
    where user_id = p_user_id and source_type = 'gmail';
  select to_jsonb(x) into triage from public.auto_triage_collector_findings(p_user_id, p_limit) x;
  select to_jsonb(x) into confirmed from public.auto_confirm_matched_collector_findings(p_user_id, p_limit) x;
  select to_jsonb(x) into events from public.apply_auto_collector_events(p_user_id, p_limit) x;
  return jsonb_build_object('triage', triage, 'confirmed', confirmed, 'events', events);
end $$;
revoke all on function public.reprocess_collector_findings(uuid, integer) from public, anon, authenticated;
grant execute on function public.reprocess_collector_findings(uuid, integer) to service_role;
