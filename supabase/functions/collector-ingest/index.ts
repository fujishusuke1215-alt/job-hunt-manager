// Deploy with `supabase functions deploy collector-ingest --no-verify-jwt` and set
// COLLECTOR_GMAIL_TOKEN / COLLECTOR_WEB_TOKEN / COLLECTOR_OWNER_USER_ID as secrets.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const type = request.headers.get('x-collector-type')
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const expected = type === 'gmail' ? Deno.env.get('COLLECTOR_GMAIL_TOKEN') : type === 'web' ? Deno.env.get('COLLECTOR_WEB_TOKEN') : null
  if (!expected || token !== expected) return new Response('unauthorized', { status: 401 })
  const owner = Deno.env.get('COLLECTOR_OWNER_USER_ID'); if (!owner) return new Response('server misconfigured', { status: 500 })
  const body = await request.json(); if (!Array.isArray(body.findings) || body.findings.length > 100) return new Response('invalid payload', { status: 400 })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const rows = body.findings.map((f: Record<string, unknown>) => ({ ...f, user_id: owner, source_type: type, evidence_excerpt: String(f.evidence_excerpt ?? '').slice(0, 800), fingerprint: String(f.fingerprint ?? '') })).filter((f: { fingerprint: string }) => f.fingerprint)
  const { error } = await admin.from('collector_findings').upsert(rows, { onConflict: 'user_id,fingerprint', ignoreDuplicates: true })
  if (error) return new Response('ingest failed', { status: 500 })
  return Response.json({ accepted: rows.length })
})
