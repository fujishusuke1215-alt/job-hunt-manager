-- High-confidence company matches are acknowledged automatically. This does
-- not invent a selection stage; only apply_auto_collector_events creates a
-- formal event when an explicit fact is available.
create or replace function public.auto_confirm_matched_collector_findings(p_user_id uuid, p_limit integer default 500)
returns table(auto_confirmed integer)
language plpgsql security definer set search_path = public as $$
declare changed integer := 0;
begin
  with candidates as (
    select id from public.collector_findings
    where user_id = p_user_id
      and status = 'needs_review'
      and triage_confidence >= .9
      and triage_reason in ('subject_canonical_exact','subject_alias_exact')
    order by observed_at asc
    limit greatest(1, least(p_limit, 1000))
  ), updated as (
    update public.collector_findings f set
      status = 'approved', triage_action = 'auto_matched',
      review_reason = coalesce(triage_reason, 'high_confidence_company_match'),
      updated_at = now()
    from candidates c where f.id = c.id
    returning f.id, f.user_id, f.company, f.triage_reason, f.triage_confidence
  ), logged as (
    insert into public.collector_triage_audit(user_id,finding_id,action,company,reason,confidence,processed_at)
    select user_id,id,'auto_matched',company,coalesce(triage_reason,'high_confidence_company_match'),coalesce(triage_confidence,0),now()
    from updated
    on conflict (finding_id,action,reason) do update set processed_at = excluded.processed_at
    returning id
  ) select count(*) into changed from logged;
  auto_confirmed := changed; return next;
end $$;
revoke all on function public.auto_confirm_matched_collector_findings(uuid, integer) from public, anon, authenticated;
grant execute on function public.auto_confirm_matched_collector_findings(uuid, integer) to service_role;
