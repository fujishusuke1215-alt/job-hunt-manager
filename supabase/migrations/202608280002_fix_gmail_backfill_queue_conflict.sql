-- `ON CONFLICT DO NOTHING` is used by automatic Gmail onboarding. PostgreSQL
-- cannot use a deferrable unique constraint as an ON CONFLICT arbiter, so keep
-- the same idempotency key as an immediate (non-deferrable) constraint.
alter table public.gmail_backfill_requests
  drop constraint if exists gmail_backfill_requests_user_id_monitoring_target_id_status_key;

alter table public.gmail_backfill_requests
  add constraint gmail_backfill_requests_user_id_monitoring_target_id_status_key
  unique (user_id, monitoring_target_id, status);
