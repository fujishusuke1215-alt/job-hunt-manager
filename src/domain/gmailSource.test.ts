import { describe, expect, it } from 'vitest'
import { buildGmailSourceUrl } from './gmailSource'

describe('buildGmailSourceUrl', () => {
  const collector = 'collector@example.test'

  it('uses the verified collector account path and RFC Message-ID as the primary search', () => {
    const url = buildGmailSourceUrl({
      gmailAccount: collector,
      sourceRfcMessageId: '<message-123@example.test>',
      legacySourceUrl: 'https://mail.google.com/mail/?authuser=other%40example.test#search/from%3Arecruiter',
    })

    expect(url).toBe('https://accounts.google.com/AccountChooser?Email=collector%40example.test&continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F%23search%2Frfc822msgid%253Amessage-123%2540example.test')
  })

  it('rebuilds a legacy search query under the verified collector account', () => {
    const url = buildGmailSourceUrl({
      gmailAccount: collector,
      legacySourceUrl: 'https://mail.google.com/mail/?authuser=other%40example.test#search/from%3Arecruiter%40example.test%20subject%3A%28Interview%29',
    })

    expect(url).toContain('AccountChooser?Email=collector%40example.test')
    expect(url).toContain('mail.google.com%2Fmail%2Fu%2F0')
    expect(url).toContain('from%253Arecruiter%2540example.test')
    expect(url).not.toContain('other%40example.test')
  })

  it('never trusts a legacy URL account or produces a link without a verified account', () => {
    expect(buildGmailSourceUrl({
      legacySourceUrl: 'https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aold%40example.test',
    })).toBeNull()
    expect(buildGmailSourceUrl({
      gmailAccount: 'not an account',
      sourceRfcMessageId: '<message@example.test>',
    })).toBeNull()
  })
})
