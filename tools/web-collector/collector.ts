import { createHash } from 'node:crypto'
export function normalizeHtml(html: string) { return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/cookie[^<]{0,200}/gi, '').replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g, '').replace(/\s+/g, ' ').trim() }
export function contentFingerprint(url: string, html: string) { return createHash('sha256').update(url + '\n' + normalizeHtml(html)).digest('hex') }
