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
  if (type === 'gmail' && body.action === 'gmail_backfill_requests') {
    const { data, error } = await admin.from('gmail_backfill_requests').select('id,monitoring_target_id,monitoring_targets!inner(canonical_name,aliases,sender_domains)').eq('user_id', owner).eq('status', 'queued').order('requested_at').limit(10)
    if (error) return new Response('backfill queue failed', { status: 500 })
    const requests = (data ?? []).map((row: Record<string, unknown>) => {
      const target = row.monitoring_targets as Record<string, unknown>
      return { id: row.id, canonical_name: target.canonical_name, aliases: target.aliases, sender_domains: target.sender_domains }
    })
    if (requests.length) await admin.from('gmail_backfill_requests').update({ status: 'running', started_at: new Date().toISOString() }).in('id', requests.map((item) => item.id))
    return Response.json({ requests })
  }
  if (type === 'gmail' && body.action === 'gmail_backfill_complete') {
    const id = String(body.request_id ?? '')
    if (!id) return new Response('invalid backfill request', { status: 400 })
    const failed = typeof body.error === 'string' && body.error.length > 0
    const { error } = await admin.from('gmail_backfill_requests').update({ status: failed ? 'failed' : 'completed', completed_at: new Date().toISOString(), last_error: failed ? body.error.slice(0, 500) : null, result_count: Math.max(0, Number(body.result_count ?? 0)) }).eq('id', id).eq('user_id', owner)
    return error ? new Response('backfill completion failed', { status: 500 }) : Response.json({ ok: true })
  }
  if (type === 'web' && body.action === 'targets') { const { data, error } = await admin.from('monitoring_targets').select('id,canonical_name,official_url,updated_at').in('status',['active','watch']).eq('enabled',true).not('official_url','is',null); if(error)return new Response('targets failed',{status:500}); const ids=(data??[]).map(x=>x.id); const {data:states,error:stateError}=ids.length?await admin.from('collector_state').select('target_key,cursor').eq('user_id',owner).eq('collector_type','web').in('target_key',ids):{data:[],error:null}; if(stateError)return new Response('state lookup failed',{status:500}); const byTarget=new Map((states??[]).map(s=>[s.target_key,s.cursor as Record<string,unknown>])); return Response.json({targets:(data??[]).map(x=>({...x,content_hash:typeof byTarget.get(x.id)?.content_hash==='string'?byTarget.get(x.id)?.content_hash:null}))}) }
  if (type === 'web' && body.action === 'state') { const target=String(body.target_id??''); if(!target)return new Response('invalid target',{status:400}); if(body.dry_run===true)return Response.json({ok:true,dry_run:true}); const {data:prior,error:priorError}=await admin.from('collector_state').select('cursor,failure_count').eq('user_id',owner).eq('collector_type','web').eq('target_key',target).maybeSingle(); if(priorError)return new Response('state lookup failed',{status:500}); const failed=Boolean(body.error_category); const update=failed?{last_attempt:body.last_attempt??new Date().toISOString(),last_error_category:String(body.error_category),failure_count:Number(prior?.failure_count??0)+1}:{last_attempt:body.last_attempt??new Date().toISOString(),last_success:body.last_success??new Date().toISOString(),last_error_category:null,failure_count:0,cursor:{content_hash:body.content_hash,final_url:body.final_url}}; const {error}=await admin.from('collector_state').upsert({user_id:owner,collector_type:'web',target_key:target,...update},{onConflict:'user_id,collector_type,target_key'}); return error?new Response('state failed',{status:500}):Response.json({ok:true}) }
  if (body.action && body.action !== 'ingest') return new Response('invalid action', { status: 400 })
  if (!Array.isArray(body.findings) || body.findings.length > 100) return new Response('invalid payload', { status: 400 })
  const rows = body.findings.map((f: Record<string, unknown>) => ({ ...f, user_id: owner, source_type: type, evidence_excerpt: String(f.evidence_excerpt ?? '').slice(0, 800), fingerprint: String(f.fingerprint ?? '') })).filter((f: { fingerprint: string }) => f.fingerprint)
  const { error } = await admin.from('collector_findings').upsert(rows, { onConflict: 'user_id,fingerprint' })
  if (error) return new Response('ingest failed', { status: 500 })
  // Daily collectors only write proposals. The database function resolves known
  // companies and advances only explicit, high-confidence facts; ambiguous data
  // remains in the review inbox.
  const { data: triage, error: triageError } = await admin.rpc('auto_triage_collector_findings', { p_user_id: owner, p_limit: 500 })
  if (triageError) return new Response('triage failed', { status: 500 })
  const { data: confirmed, error: confirmedError } = await admin.rpc('auto_confirm_matched_collector_findings', { p_user_id: owner, p_limit: 500 })
  if (confirmedError) return new Response('notification confirmation failed', { status: 500 })
  const { data: events, error: eventsError } = await admin.rpc('apply_auto_collector_events', { p_user_id: owner, p_limit: 500 })
  if (eventsError) return new Response('event reflection failed', { status: 500 })
  return Response.json({ accepted: rows.length, triage: Array.isArray(triage) ? triage[0] ?? null : triage, confirmed: Array.isArray(confirmed) ? confirmed[0] ?? null : confirmed, events: Array.isArray(events) ? events[0] ?? null : events })
})
