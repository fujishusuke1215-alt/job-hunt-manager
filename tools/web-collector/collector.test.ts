import { describe, expect, it } from 'vitest'; import { contentFingerprint } from './collector'
describe('normalized web diff', () => it('ignores scripts and dates', () => expect(contentFingerprint('u','<script>x()</script><p>2026-08-24 open</p>')).toBe(contentFingerprint('u','<p>2026-09-01 open</p>'))))
