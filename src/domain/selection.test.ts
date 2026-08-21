import { describe, expect, it } from 'vitest'
import { selectionFromLabel, selectionLabel } from './selection'

describe('selection status model', () => {
  it('不合格と選考管理終了を内部的に区別する', () => {
    expect(selectionFromLabel('不合格')).toMatchObject({ selectionState: 'closed', closeReason: 'rejected' })
    expect(selectionFromLabel('選考管理を終了')).toMatchObject({ selectionState: 'closed', closeReason: 'user_closed' })
  })

  it('内定は内定後の意思決定を未決定で開始する', () => {
    expect(selectionFromLabel('内定')).toMatchObject({ selectionPhase: 'offer', selectionState: 'active', offerDecision: 'considering' })
  })

  it('旧statusも一般向けの表示へ安全に変換する', () => {
    expect(selectionLabel({ applicationStatus: '面接待ち' })).toBe('1次面接')
    expect(selectionLabel({ applicationStatus: '終了' })).toBe('選考管理を終了')
  })
})
