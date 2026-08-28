/* Owner-only Gmail collector. Configure INGEST_URL, COLLECTOR_TOKEN, BACKFILL_SINCE, and GMAIL_ACCOUNT_INDEX. */
const JST = 'Asia/Tokyo';
function runInitialBackfill() { return runCollector_(true); }
function runDailyIncremental() { runCollector_(false); runQueuedCompanyBackfills_(); }
function runCollector_(backfill) {
  const p = PropertiesService.getScriptProperties(), now = new Date();
  const since = new Date(backfill ? (p.getProperty('BACKFILL_SINCE') || '2026-07-24T00:00:00+09:00') : (p.getProperty('LAST_SUCCESSFUL_SYNC') || p.getProperty('BACKFILL_SINCE') || '2026-07-24T00:00:00+09:00'));
  since.setHours(since.getHours() - 2);
  const query = `after:${Utilities.formatDate(since, JST, 'yyyy/MM/dd')} (採用 OR 選考 OR 面接 OR ES OR "Webテスト" OR 適性検査 OR エントリー OR インターン OR 説明会 OR 結果 OR 締切 OR マイページ)`;
  const list = Gmail.Users.Messages.list('me', { q: query, maxResults: Number(p.getProperty('BACKFILL_BATCH_SIZE') || '50'), pageToken: p.getProperty('RESUME_PAGE_TOKEN') || undefined });
  ingest_((list.messages || []).map(ref => toFinding_(Gmail.Users.Messages.get('me', ref.id, { format: 'full' }), now)));
  if (list.nextPageToken) { p.setProperty('RESUME_PAGE_TOKEN', list.nextPageToken); return; }
  p.deleteProperty('RESUME_PAGE_TOKEN'); p.setProperty('LAST_SUCCESSFUL_SYNC', now.toISOString());
}
function runQueuedCompanyBackfills_() {
  const queue = api_('gmail_backfill_requests', {}); (queue.requests || []).forEach(request => {
    try {
      const names = [request.canonical_name].concat(request.aliases || []).filter(Boolean).map(x => `"${String(x).replace(/"/g, '')}"`);
      const domains = (request.sender_domains || []).filter(Boolean).map(x => `from:(@${x})`);
      const list = Gmail.Users.Messages.list('me', { q: `(${names.concat(domains).join(' OR ')}) newer_than:730d`, maxResults: 100 });
      const findings = (list.messages || []).map(ref => toFinding_(Gmail.Users.Messages.get('me', ref.id, { format: 'full' }), new Date()));
      ingest_(findings); api_('gmail_backfill_complete', { request_id: request.id, result_count: findings.length });
    } catch (error) { api_('gmail_backfill_complete', { request_id: request.id, error: String(error).slice(0, 500) }); }
  });
}
function classify_(text) {
  const v = text.replace(/\s+/g, ' ');
  if (/(内定|採用決定|オファー).{0,20}(おめでとう|通知|連絡)|内定通知/.test(v)) return 'offer';
  if (/(不採用|選考.*(?:見送|通過.*?ならず)|残念.*(?:結果|お知らせ))/.test(v)) return 'rejection';
  if (/(エントリー|応募).{0,18}(受付|受け付け|ありがとう|完了)/.test(v)) return 'entry_completed';
  if (/(ES|エントリーシート).{0,20}(提出.{0,8}(完了|ありがとう)|受領)/.test(v)) return 'es_submitted';
  if (/(Webテスト|WEBテスト|適性検査|SPI).{0,20}(受検.{0,8}(完了|ありがとう)|受験.{0,8}完了)/i.test(v)) return 'web_test_completed';
  if (/(面接|面談).{0,40}(予約.{0,8}(完了|確定)|日程.{0,12}(確定|予約)|予約しました)/.test(v)) return 'interview_scheduled';
  if (/(面接|面談).{0,30}(予約|日程調整|候補日).{0,20}(ください|必要|選択)/.test(v)) return 'interview_reservation_required';
  if (/(Webテスト|WEBテスト|適性検査|SPI).{0,35}(まで|締切|受検してください|受験してください)/i.test(v)) return 'web_test_deadline';
  if (/(ES|エントリーシート).{0,35}(まで|締切|提出してください)/.test(v)) return 'es_deadline';
  if (/(履歴書|職務経歴書|ポートフォリオ|書類).{0,35}(まで|締切|提出してください)/.test(v)) return 'document_required';
  if (/(説明会|座談会|イベント).{0,30}(予約.{0,8}(完了|確定)|開催|予定)/.test(v)) return 'event_scheduled';
  if (/(説明会|座談会|イベント).{0,30}(ご案内|招待|予約)/.test(v)) return 'event_invitation';
  if (/(マイページ|MyPage).{0,30}(作成|開設|登録|ID)/i.test(v)) return 'mypage_created';
  if (/(結果|選考結果|合否).{0,30}(お知らせ|通知|ご連絡)/.test(v)) return 'result_notice';
  if (/(メルマガ|ニュースレター|採用コラム|業界研究|キャンペーン|企業ニュース)/.test(v)) return 'marketing';
  if (/(ありがとうございました|ご確認ください)/.test(v)) return 'no_action'; return 'unknown';
}
function actionType_(t) { return ({es_deadline:'ES_DEADLINE',web_test_deadline:'WEB_TEST_DEADLINE',interview_reservation_required:'INTERVIEW_RESERVATION_REQUIRED',interview_scheduled:'INTERVIEW_SCHEDULED',event_scheduled:'EVENT_SCHEDULED',event_invitation:'EVENT_INVITATION',document_required:'DOCUMENT_REQUIRED',es_submitted:'ES_SUBMITTED',web_test_completed:'WEB_TEST_COMPLETED',entry_completed:'ENTRY_COMPLETED',offer:'OFFER',rejection:'REJECTION',result_notice:'RESULT_NOTICE',mypage_created:'MYPAGE_CREATED'})[t] || null; }
function parseDateTime_(text, receivedAt) {
  const base = new Date(receivedAt), v = text.replace(/[（(][^)）]*[）)]/g, ' ').replace(/\s+/g, ' '); let y,m,d,h=null,min=0;
  const rel = v.match(/(本日|今日|明日|あした|翌日)\s*(午前|午後)?\s*(正午|\d{1,2}(?:時|:\d{2})?)/);
  if(rel) { const x=Utilities.formatDate(base,JST,'yyyy/M/d').split('/').map(Number); y=x[0];m=x[1];d=x[2]; if(/明日|あした|翌日/.test(rel[1])) { const t=new Date(Date.UTC(y,m-1,d)+86400000);y=t.getUTCFullYear();m=t.getUTCMonth()+1;d=t.getUTCDate(); } if(rel[3]==='正午')h=12;else{const z=rel[3].match(/(\d{1,2})(?::(\d{2}))?/);h=Number(z[1]);min=Number(z[2]||0);if(rel[2]==='午後'&&h<12)h+=12;} }
  else { const hit=v.match(/(?:(20\d{2})[年/.\-])?\s*(\d{1,2})[月/.\-](\d{1,2})日?\s*(?:(午前|午後)?\s*(\d{1,2})(?:時|:(\d{2}))?)?/); if(!hit)return null; y=hit[1]?Number(hit[1]):Number(Utilities.formatDate(base,JST,'yyyy'));m=Number(hit[2]);d=Number(hit[3]);if(hit[5]){h=Number(hit[5]);min=Number(hit[6]||0);if(hit[4]==='午後'&&h<12)h+=12;} if(!hit[1]&&m<Number(Utilities.formatDate(base,JST,'M'))-3)y+=1; }
  if(h===null)return {date:`${y}-${pad_(m)}-${pad_(d)}`,at:null,endAt:null}; const at=new Date(`${y}-${pad_(m)}-${pad_(d)}T${pad_(h)}:${pad_(min)}:00+09:00`); if(!Number.isFinite(at.getTime()))return null;
  const range=v.match(/(?:〜|～|\-|–|から)\s*(\d{1,2})(?:時|:(\d{2}))?/);let endAt=null;if(range){let eh=Number(range[1]),em=Number(range[2]||0);if(eh<h)eh+=12;const end=new Date(`${y}-${pad_(m)}-${pad_(d)}T${pad_(eh)}:${pad_(em)}:00+09:00`);if(end>at)endAt=end.toISOString();} return {date:`${y}-${pad_(m)}-${pad_(d)}`,at:at.toISOString(),endAt};
}
function pad_(n) { return String(n).padStart(2,'0'); }
function toFinding_(message, now) {
  const heads=Object.fromEntries((message.payload.headers||[]).map(h=>[h.name.toLowerCase(),h.value])), subject=heads.subject||'', text=extractText_(message.payload), all=subject+'\n'+text, receivedAt=new Date(Number(message.internalDate)).toISOString(), type=classify_(all), actionType=actionType_(type), parsed=parseDateTime_(all,receivedAt), urls=(text.match(/https?:\/\/[^\s<>"']+/g)||[]).slice(0,10);
  const due=/deadline|required|reservation|document/i.test(actionType||'')&&parsed?(parsed.at||new Date(`${parsed.date}T23:59:00+09:00`).toISOString()):null, starts=/scheduled|invitation/i.test(actionType||'')&&parsed?.at?parsed.at:null, sender=heads.from||'', gmailAccountIndex=PropertiesService.getScriptProperties().getProperty('GMAIL_ACCOUNT_INDEX')||'0', search=`https://mail.google.com/mail/u/${encodeURIComponent(gmailAccountIndex)}/#search/${encodeURIComponent(`from:(${sender.match(/<([^>]+)>/)?.[1]||sender}) subject:(${subject.replace(/"/g,'').slice(0,120)})`)}`, myPageUrl=urls.find(url=>/^https:\/\//i.test(url)&&/mypage|my-page|entry|recruit|career/i.test(url)&&/マイページ|MyPage|ログイン|採用/i.test(all))||null;
  return {finding_type:type,source_external_id:message.id,source_thread_id:message.threadId,source_url:search,source_timestamp:receivedAt,observed_at:now.toISOString(),company:null,confidence:actionType&&(due||starts||/completed|offer|rejection|mypage/.test(type))?.92:(type==='marketing'||type==='no_action'?.9:.55),evidence_excerpt:(subject+' — '+text).slice(0,800),action_type:actionType,action_due_at:due,action_starts_at:starts,action_ends_at:starts&&parsed?.endAt?parsed.endAt:null,payload:{subject,sender,attachment:hasAttachment_(message.payload),urls,myPageUrl,actionType,actionTitle:subject,dueAt:due,startsAt:starts,endsAt:starts&&parsed?.endAt?parsed.endAt:null},fingerprint:`gmail:${message.id}:${type}`};
}
function decodeBody_(data) {
  if (!data) return '';
  try {
    if (typeof data !== 'string') return Utilities.newBlob(data).getDataAsString('UTF-8');
    const clean=String(data).replace(/\s+/g,'');
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(clean)).getDataAsString('UTF-8');
  } catch (_) {
    return '';
  }
}
function extractText_(part) { const own=decodeBody_(part.body&&part.body.data);return [own].concat((part.parts||[]).map(extractText_)).join('\n').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,10000); }
function hasAttachment_(part) { return Boolean(part.filename||(part.parts||[]).some(hasAttachment_)); }
function api_(action,body) { const p=PropertiesService.getScriptProperties(),r=UrlFetchApp.fetch(p.getProperty('INGEST_URL'),{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+p.getProperty('COLLECTOR_TOKEN'),'x-collector-type':'gmail'},payload:JSON.stringify(Object.assign({action},body||{})),muteHttpExceptions:true});if(r.getResponseCode()>=300)throw new Error('collector API failed: '+r.getResponseCode());return JSON.parse(r.getContentText()||'{}'); }
function ingest_(findings) { return api_('ingest',{findings}); }
