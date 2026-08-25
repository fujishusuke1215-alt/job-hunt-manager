-- AppDataV2 remains the user-facing source of truth. Collectors only write proposal tables.
create table if not exists public.user_app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_data jsonb not null,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monitoring_targets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  candidate_company_id text not null, canonical_name text not null, aliases text[] not null default '{}',
  official_url text, mypage_url text, sender_domains text[] not null default '{}',
  status text not null check (status in ('pending_enrichment','eligibility_review','active','watch','excluded','disabled','archived')),
  work_history_eligibility text not null default 'needs_review' check (work_history_eligibility in ('confirmed','eligible_no_exclusion_found','needs_review','ineligible')),
  eligibility_source_url text, eligibility_checked_at timestamptz, eligibility_evidence text,
  enabled boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique (user_id, candidate_company_id)
);

create table if not exists public.collector_findings (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  monitoring_target_id uuid references public.monitoring_targets(id) on delete set null,
  company text, finding_type text not null, payload jsonb not null default '{}', source_type text not null check (source_type in ('gmail','web','manual')),
  source_external_id text, source_url text, source_timestamp timestamptz, observed_at timestamptz not null default now(),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1), evidence_excerpt text not null default '',
  fingerprint text not null, status text not null default 'new' check (status in ('new','needs_review','approved','rejected','superseded')),
  supersedes_id uuid references public.collector_findings(id), review_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create table if not exists public.collector_state (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  collector_type text not null check (collector_type in ('gmail','web')), target_key text not null default 'global',
  cursor jsonb not null default '{}', last_attempt timestamptz, last_success timestamptz, failure_count integer not null default 0 check (failure_count >= 0), last_error_category text, resume_token text, updated_at timestamptz not null default now(),
  unique (user_id, collector_type, target_key)
);

alter table public.user_app_data enable row level security;
alter table public.monitoring_targets enable row level security;
alter table public.collector_findings enable row level security;
alter table public.collector_state enable row level security;

create policy "user_app_data owner" on public.user_app_data for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "monitoring_targets owner" on public.monitoring_targets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "collector_findings owner" on public.collector_findings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "collector_state owner" on public.collector_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.save_user_app_data(expected_revision bigint, next_app_data jsonb)
returns public.user_app_data language plpgsql security invoker set search_path = public as $$
declare saved public.user_app_data;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if expected_revision is null then
    insert into public.user_app_data(user_id, app_data, revision) values (auth.uid(), next_app_data, 1)
    on conflict (user_id) do nothing returning * into saved;
    if saved.user_id is null then raise exception 'revision_conflict'; end if;
  else
    update public.user_app_data set app_data = next_app_data, revision = revision + 1, updated_at = now()
    where user_id = auth.uid() and revision = expected_revision returning * into saved;
    if saved.user_id is null then raise exception 'revision_conflict'; end if;
  end if;
  return saved;
end $$;

create or replace function public.sync_monitoring_targets(targets jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  insert into public.monitoring_targets (user_id, candidate_company_id, canonical_name, aliases, official_url, mypage_url, sender_domains, status, work_history_eligibility, eligibility_source_url, eligibility_checked_at, eligibility_evidence, enabled)
  select auth.uid(), item->>'candidate_company_id', item->>'canonical_name', coalesce(array(select jsonb_array_elements_text(item->'aliases')), '{}'), nullif(item->>'official_url',''), nullif(item->>'mypage_url',''), coalesce(array(select jsonb_array_elements_text(item->'sender_domains')), '{}'), coalesce(item->>'status','watch'), coalesce(item->>'work_history_eligibility','needs_review'), nullif(item->>'eligibility_source_url',''), nullif(item->>'eligibility_checked_at','')::timestamptz, nullif(item->>'eligibility_evidence',''), coalesce((item->>'enabled')::boolean,false) from jsonb_array_elements(targets) item
  on conflict (user_id, candidate_company_id) do update set canonical_name = excluded.canonical_name, aliases = array(select distinct unnest(public.monitoring_targets.aliases || excluded.aliases)), official_url = coalesce(excluded.official_url, public.monitoring_targets.official_url), mypage_url = coalesce(excluded.mypage_url, public.monitoring_targets.mypage_url), sender_domains = array(select distinct unnest(public.monitoring_targets.sender_domains || excluded.sender_domains)), updated_at = now();
end $$;
