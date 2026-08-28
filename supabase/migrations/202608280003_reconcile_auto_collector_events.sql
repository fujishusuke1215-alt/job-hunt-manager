-- A prior collector deployment could append the same canonical event more than
-- once within its resolved company. Keep the first evidence-backed event, leave
-- manual events untouched, and remove automatic events from a company that does
-- not own the corresponding monitoring target.
with rebuilt as (
  select app.user_id,
    jsonb_agg(
      jsonb_set(company.company, '{events}', coalesce((
        select jsonb_agg(filtered.event order by filtered.ordinality)
        from (
          select event.event, event.ordinality,
            row_number() over (
              partition by case
                when coalesce(event.event->>'autoProcessed', 'false') = 'true'
                  then coalesce(event.event->>'id', event.ordinality::text)
                else event.ordinality::text
              end
              order by event.ordinality
            ) as ordinal
          from jsonb_array_elements(coalesce(company.company->'events', '[]'::jsonb))
            with ordinality event(event, ordinality)
          where coalesce(event.event->>'autoProcessed', 'false') <> 'true'
            or exists (
              select 1
              from public.collector_findings finding
              join public.monitoring_targets target on target.id = finding.monitoring_target_id
              where finding.source_external_id = event.event->>'sourceMessageId'
                and target.candidate_company_id = company.company->>'id'
            )
        ) filtered
        where filtered.ordinal = 1
      ), '[]'::jsonb))
      order by company.ordinality
    ) as companies
  from public.user_app_data app
  cross join lateral jsonb_array_elements(app.app_data->'userCompanies')
    with ordinality company(company, ordinality)
  group by app.user_id
)
update public.user_app_data app
set app_data = jsonb_set(app.app_data, '{userCompanies}', rebuilt.companies),
    revision = app.revision + 1,
    updated_at = now()
from rebuilt
where app.user_id = rebuilt.user_id;
