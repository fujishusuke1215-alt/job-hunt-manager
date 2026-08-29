import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type GmailPart = {
  body?: { data?: string }
  parts?: GmailPart[]
}

function loadCollectorContext() {
  const source = readFileSync(resolve(process.cwd(), 'tools/gmail-collector/Code.gs'), 'utf8')
  const context: Record<string, unknown> = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => key === 'EXPECTED_GMAIL_ACCOUNT' ? 'collector@example.test' : null,
      }),
    },
    Utilities: {
      base64DecodeWebSafe(value: string) {
        if (value.includes('%')) throw new Error('invalid base64')
        return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
      },
      newBlob(value: Uint8Array) {
        return { getDataAsString: () => Buffer.from(value).toString('utf8') }
      },
      formatDate(_value: Date, _zone: string, pattern: string) {
        return { yyyy: '2026', M: '8', 'yyyy/M/d': '2026/8/27' }[pattern] ?? ''
      },
    },
  }
  runInNewContext(source, context)
  return context
}

function loadExtractText() {
  return loadCollectorContext().extractText_ as (part: GmailPart) => string
}

describe('Gmail collector Apps Script', () => {
  it('keeps processing when one MIME part contains undecodable data', () => {
    const extractText = loadExtractText()
    const encoded = Buffer.from('一次面接は9月3日14:00です').toString('base64url')

    expect(extractText({ parts: [{ body: { data: '%%%' } }, { body: { data: encoded } }] })).toBe(
      '一次面接は9月3日14:00です',
    )
  })

  it('reads byte arrays returned by the Apps Script advanced Gmail service', () => {
    const extractText = loadExtractText()
    const bytes = [...Buffer.from('Webテストは9月1日18:00までです')]

    expect(extractText({ body: { data: bytes as unknown as string } })).toBe(
      'Webテストは9月1日18:00までです',
    )
  })

  it('stores canonical dates for uppercase action types', () => {
    const context = loadCollectorContext()
    const toFinding = context.toFinding_ as (message: unknown, now: Date) => Record<string, unknown>
    const body = [...Buffer.from('Webテストを9月1日18:00までに受検してください')]
    const finding = toFinding(
      {
        id: 'message-1',
        threadId: 'thread-1',
        internalDate: String(Date.parse('2026-08-27T08:00:00Z')),
        payload: {
          headers: [
            { name: 'Subject', value: 'Webテストのご案内' },
            { name: 'From', value: 'recruit@example.com' },
            { name: 'Message-ID', value: '<message-1@example.com>' },
          ],
          body: { data: body },
        },
      },
      new Date('2026-08-27T09:00:00Z'),
    )

    expect(finding.action_type).toBe('WEB_TEST_DEADLINE')
    expect(finding.action_due_at).toBe('2026-09-01T09:00:00.000Z')
    expect(finding.source_url).toContain('AccountChooser?Email=collector%40example.test')
    expect(finding.source_url).toContain('rfc822msgid')
    expect((finding.payload as Record<string, unknown>).rfcMessageId).toBe('<message-1@example.com>')
  })
})
