alter table public.collector_findings
  add column if not exists triage_action text not null default 'manual_review' check (triage_action in ('auto_matched','auto_approved','auto_archived','manual_review')),
  add column if not exists triage_reason text,
  add column if not exists triage_confidence numeric check (triage_confidence is null or (triage_confidence >= 0 and triage_confidence <= 1)),
  add column if not exists triaged_at timestamptz;

create table if not exists public.collector_triage_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  finding_id uuid not null references public.collector_findings(id) on delete cascade,
  action text not null check (action in ('auto_matched','auto_approved','auto_archived','manual_review')),
  company text, reason text not null, confidence numeric not null check (confidence >= 0 and confidence <= 1),
  processed_at timestamptz not null default now(),
  unique (finding_id, action, reason)
);
alter table public.collector_triage_audit enable row level security;
create policy "collector_triage_audit owner" on public.collector_triage_audit for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.normalize_company_match(value text)
returns text language sql immutable parallel safe as $$
  select lower(regexp_replace(regexp_replace(translate(coalesce(value,''), '　・･,，.．:：;；【】[]（）()「」『』', ''), '(株式会社|有限会社|合同会社|（株）|\\(株\\)|㈱)', '', 'g'), '\\s+', '', 'g'))
$$;

create or replace function public.auto_triage_collector_findings(p_user_id uuid, p_limit integer default 500)
returns table(total integer, auto_matched integer, auto_approved integer, auto_archived integer, manual_review integer, ambiguous integer)
language plpgsql security definer set search_path = public as $$
declare now_at timestamptz := now();
begin
  with pending as (
    select f.*, public.normalize_company_match(coalesce(f.payload->>'subject', f.evidence_excerpt)) as subject_norm,
      lower(coalesce(substring(f.payload->>'sender' from '@([A-Za-z0-9.-]+)'), '')) as sender_domain
    from public.collector_findings f
    where f.user_id = p_user_id and f.status in ('new','needs_review')
    order by f.observed_at asc limit greatest(1, least(p_limit, 1000))
  ), matches as (
    select p.id as finding_id, t.id as target_id, t.canonical_name,
      case when p.subject_norm like '%' || public.normalize_company_match(t.canonical_name) || '%' then .95
           when exists (select 1 from unnest(t.aliases) a where p.subject_norm like '%' || public.normalize_company_match(a) || '%') then .90
           when exists (select 1 from unnest(t.sender_domains) d where p.sender_domain = lower(d) or p.sender_domain like '%.' || lower(d)) then .80
           else null end as confidence
    from pending p join public.monitoring_targets t on t.user_id = p.user_id and t.status not in ('archived','disabled','excluded')
    where public.normalize_company_match(t.canonical_name) <> '' and (
      p.subject_norm like '%' || public.normalize_company_match(t.canonical_name) || '%'
      or exists (select 1 from unnest(t.aliases) a where public.normalize_company_match(a) <> '' and p.subject_norm like '%' || public.normalize_company_match(a) || '%')
      or exists (select 1 from unnest(t.sender_domains) d where p.sender_domain = lower(d) or p.sender_domain like '%.' || lower(d))
    )
  ), ranked as (
    select m.*, row_number() over (partition by finding_id order by confidence desc, length(canonical_name) desc) as rnk,
      lead(confidence) over (partition by finding_id order by confidence desc, length(canonical_name) desc) as next_confidence,
      lead(length(canonical_name)) over (partition by finding_id order by confidence desc, length(canonical_name) desc) as next_name_length
    from matches m where confidence is not null
  ), decision as (
    select p.id, p.user_id, r.target_id, r.canonical_name, coalesce(r.confidence,0) as confidence,
      coalesce(r.next_confidence = r.confidence and r.next_name_length = length(r.canonical_name), false) as is_ambiguous,
      case when coalesce(r.next_confidence = r.confidence and r.next_name_length = length(r.canonical_name),false) then 'manual_review'
           when r.confidence >= .9 and (coalesce(p.payload->>'subject',p.evidence_excerpt) ~ '(エントリー|応募).{0,12}(受付|受け付け|ありがとう|完了)|エントリーありがとうございます') then 'auto_approved'
           when r.confidence >= .9 and p.finding_type = 'deadline' and coalesce(p.payload->>'deadline','') ~ '^\\d{4}-\\d{2}-\\d{2}T' then 'auto_approved'
           when r.confidence >= .9 and coalesce(p.payload->>'subject',p.evidence_excerpt) ~ '(メルマガ|ニュースレター|採用コンテンツ|業界研究|コラム)' then 'auto_archived'
           else 'manual_review' end as action,
      case when coalesce(r.next_confidence = r.confidence and r.next_name_length = length(r.canonical_name),false) then 'ambiguous_company_match'
           when r.confidence is null then 'no_company_evidence'
           when r.confidence >= .95 then 'subject_canonical_exact'
           when r.confidence >= .90 then 'subject_alias_exact'
           else 'trusted_sender_domain' end as reason
    from pending p left join ranked r on r.finding_id = p.id and r.rnk = 1
  ), updated as (
    update public.collector_findings f set
      monitoring_target_id = d.target_id, company = d.canonical_name, confidence = d.confidence,
      triage_action = d.action, triage_reason = d.reason, triage_confidence = d.confidence, triaged_at = now_at,
      status = case when d.action = 'auto_approved' then 'approved' when d.action = 'auto_archived' then 'superseded' else 'needs_review' end,
      review_reason = d.reason, updated_at = now_at
    from decision d where f.id = d.id
    returning f.id, f.user_id, f.triage_action, f.company, f.triage_reason, f.triage_confidence
  ), logged as (
    insert into public.collector_triage_audit(user_id,finding_id,action,company,reason,confidence,processed_at)
    select user_id,id,triage_action,company,coalesce(triage_reason,'unknown'),coalesce(triage_confidence,0),now_at from updated
    on conflict (finding_id,action,reason) do update set processed_at = excluded.processed_at, confidence = excluded.confidence
    returning action, reason
  )
  select count(*)::integer,
    count(*) filter (where action in ('auto_approved','auto_archived') and reason <> 'no_company_evidence')::integer,
    count(*) filter (where action='auto_approved')::integer,
    count(*) filter (where action='auto_archived')::integer,
    count(*) filter (where action='manual_review')::integer,
    count(*) filter (where reason='ambiguous_company_match')::integer
  into total,auto_matched,auto_approved,auto_archived,manual_review,ambiguous from logged;
  return next;
end $$;
revoke all on function public.auto_triage_collector_findings(uuid, integer) from public, anon, authenticated;
grant execute on function public.auto_triage_collector_findings(uuid, integer) to service_role;
