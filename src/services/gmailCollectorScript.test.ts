import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type GmailPart = {
  body?: { data?: string }
  parts?: GmailPart[]
}

function loadCollectorContext(options: { properties?: Record<string, string | null>; gmailAccount?: string } = {}) {
  const source = readFileSync(resolve(process.cwd(), 'tools/gmail-collector/Code.gs'), 'utf8')
  const properties = options.properties ?? { EXPECTED_GMAIL_ACCOUNT: 'collector@example.test' }
  const context: Record<string, unknown> = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => properties[key] ?? null,
      }),
    },
    Gmail: {
      Users: {
        getProfile: () => ({ emailAddress: options.gmailAccount ?? 'collector@example.test' }),
        Messages: {
          list: () => { throw new Error('Gmail search must not run') },
          get: () => { throw new Error('Gmail fetch must not run') },
        },
      },
    },
    Logger: { log: () => undefined },
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

  it('fails closed without the expected-account property before Gmail ingestion', () => {
    const context = loadCollectorContext({ properties: {} })
    const runCollector = context.runCollector_ as (backfill: boolean) => unknown
    expect(() => runCollector(false)).toThrow('gmail_account_unconfigured')
  })

  it('fails closed for a different execution account before Gmail ingestion', () => {
    const context = loadCollectorContext({ gmailAccount: 'different@example.test' })
    const runCollector = context.runCollector_ as (backfill: boolean) => unknown
    expect(() => runCollector(false)).toThrow('gmail_account_mismatch')
  })

  it('offers a configuration self-check without collecting Gmail', () => {
    const context = loadCollectorContext({
      properties: {
        EXPECTED_GMAIL_ACCOUNT: 'collector@example.test',
        INGEST_URL: 'https://collector.example.test',
        COLLECTOR_TOKEN: 'test-only-token',
        BACKFILL_SINCE: '2026-07-24T00:00:00+09:00',
      },
    })
    const validate = context.validateCollectorConfiguration as () => Record<string, boolean>
    expect(validate()).toMatchObject({
      expectedGmailAccountConfigured: true,
      gmailAccountMatches: true,
      ingestUrlConfigured: true,
      collectorTokenConfigured: true,
      backfillSinceConfigured: true,
    })
  })

  it('removes only outer display-name wrappers before emitting a strong company name', () => {
    const context = loadCollectorContext()
    const strongCompanyName = context.strongCompanyName_ as (sender: string) => string | null
    expect(strongCompanyName('"株式会社NTTドコモ" <recruit@example.test>')).toBe('株式会社NTTドコモ')
    expect(strongCompanyName('“住友電気工業株式会社” <recruit@example.test>')).toBe('住友電気工業株式会社')
  })

  it('keeps a real personal address out of the public collector source', () => {
    const source = readFileSync(resolve(process.cwd(), 'tools/gmail-collector/Code.gs'), 'utf8')
    expect(source).not.toContain(['fuji', 'sh1215'].join('.') + '@gmail.com')
  })
})
