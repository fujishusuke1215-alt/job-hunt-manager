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
  const body = await request.json()
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (type === 'web' && body.action === 'targets') { const { data, error } = await admin.from('monitoring_targets').select('id,canonical_name,official_url,updated_at').in('status',['active','watch']).eq('enabled',true).not('official_url','is',null); if(error)return new Response('targets failed',{status:500}); return Response.json({targets:(data??[]).map(x=>({...x,content_hash:null}))}) }
  if (type === 'web' && body.action === 'state') { const target=String(body.target_id??''); if(!target)return new Response('invalid target',{status:400}); const update={ last_attempt:body.last_attempt??new Date().toISOString(), last_success:body.last_success??null, last_error_category:body.error_category??null, cursor:{content_hash:body.content_hash??null,final_url:body.final_url??null}, failure_count:body.error_category?1:0 }; const {error}=await admin.from('collector_state').upsert({user_id:owner,collector_type:'web',target_key:target,...update},{onConflict:'user_id,collector_type,target_key'}); return error?new Response('state failed',{status:500}):Response.json({ok:true}) }
  if (!Array.isArray(body.findings) || body.findings.length > 100) return new Response('invalid payload', { status: 400 })
  const rows = body.findings.map((f: Record<string, unknown>) => ({ ...f, user_id: owner, source_type: type, evidence_excerpt: String(f.evidence_excerpt ?? '').slice(0, 800), fingerprint: String(f.fingerprint ?? '') })).filter((f: { fingerprint: string }) => f.fingerprint)
  const { error } = await admin.from('collector_findings').upsert(rows, { onConflict: 'user_id,fingerprint', ignoreDuplicates: true })
  if (error) return new Response('ingest failed', { status: 500 })
  return Response.json({ accepted: rows.length })
})
