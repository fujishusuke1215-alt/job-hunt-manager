export type GmailFindingType = 'entry_completed' | 'es_submitted' | 'web_test_completed' | 'web_test_deadline' | 'es_deadline' | 'interview_scheduled' | 'interview_reservation_required' | 'offer' | 'rejection' | 'result_notice' | 'mypage_created' | 'marketing' | 'no_action' | 'unknown'
export interface ParsedRecruitingMail { findingType: GmailFindingType; actionType: string | null; dueAt: string | null; startsAt: string | null; endsAt: string | null; myPageUrl: string | null }

function typeOf(value: string): GmailFindingType {
  if (/(内定|採用決定|オファー).*?(通知|連絡)|内定通知/.test(value)) return 'offer'
  if (/(不採用|選考.*見送|通過.*ならず)/.test(value)) return 'rejection'
  if (/(エントリー|応募).{0,18}(受付|受け付け|ありがとう|完了)/.test(value)) return 'entry_completed'
  if (/(ES|エントリーシート).{0,20}(提出.*(完了|ありがとう)|受領)/.test(value)) return 'es_submitted'
  if (/(Webテスト|WEBテスト|適性検査|SPI).{0,20}(受検.*(完了|ありがとう)|受験.*完了)/i.test(value)) return 'web_test_completed'
  if (/(面接|面談).{0,40}(予約.*(完了|確定)|日程.*(確定|予約)|予約しました)/.test(value)) return 'interview_scheduled'
  if (/(面接|面談).{0,30}(予約|日程調整|候補日).{0,20}(ください|必要|選択)/.test(value)) return 'interview_reservation_required'
  if (/(Webテスト|WEBテスト|適性検査|SPI).{0,35}(まで|締切|受検してください|受験してください)/i.test(value)) return 'web_test_deadline'
  if (/(ES|エントリーシート).{0,35}(まで|締切|提出してください)/.test(value)) return 'es_deadline'
  if (/(マイページ|MyPage).{0,30}(作成|開設|登録|ID)/i.test(value)) return 'mypage_created'
  if (/(結果|選考結果|合否).{0,30}(お知らせ|通知|ご連絡)/.test(value)) return 'result_notice'
  if (/(メルマガ|ニュースレター|採用コラム|業界研究|キャンペーン|企業ニュース)/.test(value)) return 'marketing'
  if (/ありがとうございました/.test(value)) return 'no_action'
  return 'unknown'
}
const actionType: Record<GmailFindingType, string | null> = { entry_completed: 'ENTRY_COMPLETED', es_submitted: 'ES_SUBMITTED', web_test_completed: 'WEB_TEST_COMPLETED', web_test_deadline: 'WEB_TEST_DEADLINE', es_deadline: 'ES_DEADLINE', interview_scheduled: 'INTERVIEW_SCHEDULED', interview_reservation_required: 'INTERVIEW_RESERVATION_REQUIRED', offer: 'OFFER', rejection: 'REJECTION', result_notice: 'RESULT_NOTICE', mypage_created: 'MYPAGE_CREATED', marketing: null, no_action: null, unknown: null }
const pad = (n: number) => String(n).padStart(2, '0')

function dateTime(value: string, receivedAt: string) {
  const hit = value.match(/(?:(20\d{2})年)?\s*(\d{1,2})[月/]\s*(\d{1,2})日?\s*(?:[（(][^)）]*[）)])?\s*(?:(午前|午後)?\s*(\d{1,2})(?:時|:(\d{2}))?)?/)
  if (!hit) return null
  const received = new Date(receivedAt), receivedYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(received)), receivedMonth = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'numeric' }).format(received))
  let year = hit[1] ? Number(hit[1]) : receivedYear; const month = Number(hit[2]); const day = Number(hit[3]); if (!hit[1] && month < receivedMonth - 3) year += 1
  if (!hit[5]) return { date: `${year}-${pad(month)}-${pad(day)}`, at: null }
  let hour = Number(hit[5]); if (hit[4] === '午後' && hour < 12) hour += 12
  return { date: `${year}-${pad(month)}-${pad(day)}`, at: new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(Number(hit[6] ?? 0))}:00+09:00`).toISOString() }
}

export function parseRecruitingMail(subject: string, body: string, receivedAt: string): ParsedRecruitingMail {
  const value = `${subject}\n${body}`.replace(/\s+/g, ' '), findingType = typeOf(value), parsed = dateTime(value, receivedAt), type = actionType[findingType]
  const dueAt = type?.includes('DEADLINE') || type?.includes('RESERVATION') ? (parsed?.at ?? (parsed ? new Date(`${parsed.date}T23:59:00+09:00`).toISOString() : null)) : null
  const startsAt = type === 'INTERVIEW_SCHEDULED' ? parsed?.at ?? null : null
  const url = (body.match(/https?:\/\/[^\s<>"']+/g) ?? []).find(item => /^https:\/\//.test(item) && /mypage|my-page|entry|recruit|career/i.test(item) && /マイページ|MyPage|ログイン|採用/i.test(value)) ?? null
  return { findingType, actionType: type, dueAt, startsAt, endsAt: null, myPageUrl: url }
}
