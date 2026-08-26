import { describe, expect, it } from 'vitest'
import { contentFingerprint } from '../../tools/web-collector/collector'
describe('web collector normalization', () => {
  it('does not create noise changes for scripts or date stamps', () => {
    expect(contentFingerprint('https://example.test', '<script>x()</script><p>2026-08-24 募集</p>')).toBe(contentFingerprint('https://example.test', '<p>2026-09-01 募集</p>'))
  })
})
