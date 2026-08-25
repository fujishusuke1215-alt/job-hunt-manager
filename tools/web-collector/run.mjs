import { createHash } from 'node:crypto'
const endpoint=process.env.COLLECTOR_INGEST_URL, token=process.env.COLLECTOR_WEB_TOKEN, dry=process.env.COLLECTOR_DRY_RUN==='true'
if(!endpoint||!token){ console.log(JSON.stringify({dryRun:dry,skipped:'missing collector endpoint/token'})); process.exit(0) }
const api=(action,body={})=>fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`,'x-collector-type':'web'},body:JSON.stringify({action,...body})}).then(async r=>{if(!r.ok)throw new Error(`collector endpoint ${r.status}`);return r.json()})
const normal=s=>s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|cookie[^<]{0,200}/gi,'').replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,'').replace(/\s+/g,' ').trim()
const hash=(url,text)=>createHash('sha256').update(url+'\n'+text).digest('hex')
const category=error=>error?.name==='AbortError'?'timeout':/^http_(403|404|429)$/.test(String(error?.message))?String(error.message):/^http_5\d\d$/.test(String(error?.message))?'http_5xx':String(error?.message)==='parse_error'?'parse_failure':String(error?.message).startsWith('Invalid URL')?'invalid_url':'network_error'
const targets=(await api('targets')).targets||[]; const findings=[]
for(const t of targets){ const attemptedAt=new Date().toISOString(); try {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),15000)
  let res; try { res=await fetch(t.official_url,{redirect:'follow',signal:controller.signal,headers:{'user-agent':'JobHuntManagerCollector/1.0'}}) } finally { clearTimeout(timer) }
  if(!res.ok) throw new Error(`http_${res.status}`)
  const text=normal(await res.text()); if(text.length<30)throw new Error('parse_error'); const next=hash(res.url,text)
  if(t.content_hash&&t.content_hash!==next)findings.push({monitoring_target_id:t.id,company:t.canonical_name,finding_type:'general_recruiting_information',source_url:res.url,source_timestamp:attemptedAt,observed_at:attemptedAt,confidence:.7,evidence_excerpt:text.slice(0,500),payload:{previous_hash:t.content_hash,content_hash:next},fingerprint:`web:${t.id}:${next}`})
  await api('state',{target_id:t.id,last_attempt:attemptedAt,last_success:attemptedAt,content_hash:next,final_url:res.url,dry_run:dry})
}catch(error){ try { await api('state',{target_id:t.id,last_attempt:attemptedAt,error_category:category(error),dry_run:dry}) } catch(stateError) { console.error(`state update failed for ${t.id}: ${stateError.message}`) } }
await new Promise(resolve=>setTimeout(resolve,700)) }
if(!dry&&findings.length)await api('findings',{findings}); console.log(JSON.stringify({dryRun:dry,targets:targets.length,findings:findings.length}))
