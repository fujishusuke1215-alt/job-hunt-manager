import { describe, expect, it } from 'vitest'
import { parseRecruitingMail } from './gmailParser'

describe('parseRecruitingMail', () => {
  const received = '2026-08-27T01:00:00.000Z'
  it('creates a WEB_TEST deadline from an explicit Japanese deadline', () => {
    const item = parseRecruitingMail('○○株式会社 Webテストのご案内', 'Webテストを9月1日18:00までに受検してください', received)
    expect(item).toMatchObject({ findingType: 'web_test_deadline', actionType: 'WEB_TEST_DEADLINE', dueAt: '2026-09-01T09:00:00.000Z' })
  })
  it('keeps an interview date as a scheduled time, not an ES deadline', () => {
    const item = parseRecruitingMail('一次面接予約完了', '一次面接を9月3日（水）14:00で予約しました', received)
    expect(item).toMatchObject({ findingType: 'interview_scheduled', startsAt: '2026-09-03T05:00:00.000Z' })
  })
  it('infers next year across December to January', () => {
    const item = parseRecruitingMail('面接予約', '面接を1月3日 14:00で予約しました', '2026-12-20T01:00:00.000Z')
    expect(item.startsAt).toBe('2027-01-03T05:00:00.000Z')
  })
  it('does not reject body dates merely because there is an attachment', () => {
    expect(parseRecruitingMail('面接案内.pdf', '面接を9/3 14:00で予約しました。添付をご確認ください。', received).findingType).toBe('interview_scheduled')
  })
  it('extracts only an explicit HTTPS MyPage URL', () => {
    expect(parseRecruitingMail('マイページ開設', 'マイページはこちら https://example.com/mypage/login', received).myPageUrl).toBe('https://example.com/mypage/login')
  })
})
