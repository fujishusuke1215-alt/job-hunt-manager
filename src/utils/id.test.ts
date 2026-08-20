import { describe, expect, it, vi } from 'vitest'
import { createId } from './id'

describe('createId', () => {
  it('randomUUIDが使える場合はその値を返す', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-value' })
    expect(createId()).toBe('uuid-value')
  })

  it('非セキュアな接続でrandomUUIDがなくてもIDを作れる', () => {
    vi.stubGlobal('crypto', {})
    expect(createId('company')).toMatch(/^company-/)
  })
})
