-- Convert only explicit, high-confidence collector facts into the existing
-- AppDataV2 selection history. Ambiguous records remain in the inbox.
alter table public.collector_findings
  add column if not exists auto_event_id text;

create or replace function public.apply_auto_collector_events(p_user_id uuid, p_limit integer default 500)
returns table(created_events integer, skipped_events integer)
language plpgsql security definer set search_path = public as $$
declare
  finding record;
  app jsonb;
  company_index integer;
  events jsonb;
  event_json jsonb;
  created_count integer := 0;
  skipped_count integer := 0;
  event_type text;
  event_status text;
  event_at text;
begin
  for finding in
    select f.id, f.source_timestamp, f.observed_at, f.finding_type, f.payload,
      f.source_external_id, f.evidence_excerpt, t.candidate_company_id
    from public.collector_findings f
    join public.monitoring_targets t on t.id = f.monitoring_target_id
    where f.user_id = p_user_id
      and f.triage_action = 'auto_approved'
      and f.auto_event_id is null
      and f.status = 'approved'
    order by f.observed_at asc
    limit greatest(1, least(p_limit, 1000))
  loop
    -- We record entry receipts as completed history. A deadline is only made a
    -- planned event when the collector supplied a canonical ISO datetime.
    if finding.finding_type in ('entry_completed', 'entry_receipt', 'application_completed') then
      event_type := 'エントリー'; event_status := '完了';
      event_at := to_char(coalesce(finding.source_timestamp, finding.observed_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    elsif finding.finding_type = 'deadline' and coalesce(finding.payload->>'deadline','') ~ '^\\d{4}-\\d{2}-\\d{2}T' then
      event_type := 'ES'; event_status := '予定'; event_at := finding.payload->>'deadline';
    else
      skipped_count := skipped_count + 1;
      update public.collector_findings set auto_event_id = 'not-applicable', updated_at = now() where id = finding.id;
      continue;
    end if;

    select app_data into app from public.user_app_data where user_id = p_user_id for update;
    select ordinality - 1 into company_index
    from jsonb_array_elements(app->'userCompanies') with ordinality item(value, ordinality)
    where item.value->>'id' = finding.candidate_company_id
    limit 1;
    if company_index is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    events := coalesce(app #> array['userCompanies', company_index::text, 'events'], '[]'::jsonb);
    event_json := jsonb_build_object(
      'id', 'collector-event-' || finding.id,
      'type', event_type,
      'title', left(coalesce(finding.payload->>'subject', finding.evidence_excerpt, event_type), 240),
      'scheduledAt', event_at,
      'status', event_status,
      'location', '',
      'memo', 'Collector自動反映（根拠ID: ' || coalesce(finding.source_external_id, finding.id::text) || '）'
    );
    if events @> jsonb_build_array(jsonb_build_object('id', 'collector-event-' || finding.id)) then
      update public.collector_findings set auto_event_id = 'collector-event-' || finding.id, updated_at = now() where id = finding.id;
      skipped_count := skipped_count + 1;
      continue;
    end if;
    app := jsonb_set(app, array['userCompanies', company_index::text, 'events'], events || jsonb_build_array(event_json));
    update public.user_app_data set app_data = app, revision = revision + 1, updated_at = now() where user_id = p_user_id;
    update public.collector_findings set auto_event_id = 'collector-event-' || finding.id, updated_at = now() where id = finding.id;
    created_count := created_count + 1;
  end loop;
  created_events := created_count; skipped_events := skipped_count; return next;
end $$;
revoke all on function public.apply_auto_collector_events(uuid, integer) from public, anon, authenticated;
grant execute on function public.apply_auto_collector_events(uuid, integer) to service_role;
