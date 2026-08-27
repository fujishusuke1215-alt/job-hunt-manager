-- Older Gmail backfills classified explicit entry receipts as unknown. Repair
-- only records that were already auto-approved from a high-confidence match.
update public.collector_findings
set finding_type = 'entry_completed', auto_event_id = null, updated_at = now()
where triage_action = 'auto_approved'
  and finding_type = 'unknown'
  and coalesce(payload->>'subject', evidence_excerpt) ~ '(エントリー|応募).{0,12}(受付|受け付け|ありがとう|完了)';
