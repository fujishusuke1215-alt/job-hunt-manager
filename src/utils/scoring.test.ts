import { describe, expect, it } from 'vitest'
import { calculateOverallScore } from './scoring'

describe('calculateOverallScore', () => {
  it('すべて5点なら100点になる', () => {
    expect(calculateOverallScore({ salary: 5, benefits: 5, wlb: 5, remote: 5, flex: 5, overseas: 5, itFit: 5 }, 5)).toBe(100)
  })

  it('0〜5の範囲外を安全に丸める', () => {
    expect(calculateOverallScore({ salary: 10, benefits: 10, wlb: 10, remote: 10, flex: 10, overseas: 10, itFit: 10 }, 10)).toBe(100)
    expect(calculateOverallScore({ salary: -1, benefits: -1, wlb: -1, remote: -1, flex: -1, overseas: -1, itFit: -1 }, -1)).toBe(0)
  })
})

