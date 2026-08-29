const gmailAccountPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface GmailSourceInput {
  gmailAccount?: string | null
  sourceRfcMessageId?: string | null
  legacySourceUrl?: string | null
}

function verifiedAccount(value: string | null | undefined): string | null {
  const account = String(value ?? '').trim().toLowerCase()
  return gmailAccountPattern.test(account) ? account : null
}

function rfcQuery(value: string | null | undefined): string | null {
  const id = String(value ?? '').trim().replace(/^<|>$/g, '')
  return id ? `rfc822msgid:${id}` : null
}

function legacySearchQuery(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const match = new URL(value).hash.match(/^#search\/(.+)$/)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

/** Builds an owner-account Gmail search URL at render time; saved authuser URLs are never trusted. */
export function buildGmailSourceUrl(input: GmailSourceInput): string | null {
  const account = verifiedAccount(input.gmailAccount)
  if (!account) return null
  const query = rfcQuery(input.sourceRfcMessageId) ?? legacySearchQuery(input.legacySourceUrl)
  if (!query) return null
  // Gmail's /u/{email}/ path returns a 404 in Chrome sessions with several
  // Google accounts. AccountChooser resolves the already-signed-in owner to
  // its current numeric Gmail slot, then continues to the exact search.
  const target = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`
  return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(account)}&continue=${encodeURIComponent(target)}`
}
