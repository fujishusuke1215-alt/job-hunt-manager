-- Canonical selection events must satisfy the application's ISO datetime schema.
-- PostgreSQL timestamptz::text uses a space separator, so normalize the prior
-- collector-generated scheduledAt values to UTC ISO strings.
with rebuilt as (
  select app.user_id,
    jsonb_agg(
      jsonb_set(company.company, '{events}', coalesce((
        select jsonb_agg(
          case
            when coalesce(event.event->>'autoProcessed', 'false') = 'true'
              and coalesce(event.event->>'scheduledAt', '') <> '' then
              jsonb_set(
                event.event,
                '{scheduledAt}',
                to_jsonb(to_char((event.event->>'scheduledAt')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
              )
            else event.event
          end
          order by event.ordinality
        )
        from jsonb_array_elements(coalesce(company.company->'events', '[]'::jsonb))
          with ordinality event(event, ordinality)
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
