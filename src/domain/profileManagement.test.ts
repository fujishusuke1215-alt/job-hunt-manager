import { describe, expect, it } from 'vitest'
import { createEmptyAppData } from './migration'
import {
  addCriterionToProfile,
  createCustomProfile,
  duplicateProfile,
  moveCriterion,
  saveProfileDraft,
  setActiveProfile,
  setEvaluationValue,
} from './profileManagement'

const now = '2026-08-21T00:00:00.000Z'

describe('profile management', () => {
  it('profileを作成・複製・active変更できる', () => {
    const initial = createEmptyAppData(now)
    const created = createCustomProfile(initial, 'profile_custom', '自分用', now)
    expect(created.activeScoringProfileId).toBe('profile_custom')
    const active = setActiveProfile(created, 'profile_general_v2', now)
    const duplicated = duplicateProfile(active, 'profile_general_v2', 'profile_copy', 'コピー', now)
    expect(duplicated.activeScoringProfileId).toBe('profile_copy')
    expect(duplicated.scoringProfiles.at(-1)?.kind).toBe('custom')
  })

  it('項目追加と並び替えができる', () => {
    const profile = createEmptyAppData(now).scoringProfiles[0]
    const added = addCriterionToProfile(profile, 'criterion_added')
    const moved = moveCriterion(added, 'criterion_added', -1)
    expect(moved.criteria.at(-2)?.id).toBe('criterion_added')
  })

  it('名前とweight変更ではIDと既存評価を保持する', () => {
    let data = createEmptyAppData(now)
    data = setEvaluationValue(data, 'company-1', data.activeScoringProfileId, 'criterion_general_wlb', 4, now)
    const profile = data.scoringProfiles[0]
    const draft = {
      ...profile,
      criteria: profile.criteria.map((item) => item.id === 'criterion_general_wlb'
        ? { ...item, label: '働きやすさ', weight: 99 }
        : item),
    }
    const saved = saveProfileDraft(data, draft, now)
    expect(saved.scoringProfiles[0].criteria.find((item) => item.id === 'criterion_general_wlb')?.label).toBe('働きやすさ')
    expect(saved.evaluations[0].values.criterion_general_wlb).toBe(4)
  })

  it('最大点変更で既存値の百分率を維持する', () => {
    let data = createEmptyAppData(now)
    data = setEvaluationValue(data, 'company-1', data.activeScoringProfileId, 'criterion_general_wlb', 4, now)
    const profile = data.scoringProfiles[0]
    const draft = {
      ...profile,
      criteria: profile.criteria.map((item) => item.id === 'criterion_general_wlb' ? { ...item, scaleMax: 10 } : item),
    }
    const saved = saveProfileDraft(data, draft, now)
    expect(saved.evaluations[0].values.criterion_general_wlb).toBe(8)
  })

  it('無効化は値を保持し、完全削除は保存時に値も除く', () => {
    let data = createEmptyAppData(now)
    data = setEvaluationValue(data, 'company-1', data.activeScoringProfileId, 'criterion_general_wlb', 4, now)
    const profile = data.scoringProfiles[0]
    const disabled = saveProfileDraft(data, {
      ...profile,
      criteria: profile.criteria.map((item) => item.id === 'criterion_general_wlb' ? { ...item, enabled: false } : item),
    }, now)
    expect(disabled.evaluations[0].values.criterion_general_wlb).toBe(4)
    const deleted = saveProfileDraft(disabled, {
      ...disabled.scoringProfiles[0],
      criteria: disabled.scoringProfiles[0].criteria.filter((item) => item.id !== 'criterion_general_wlb'),
    }, now)
    expect(deleted.evaluations[0].values).not.toHaveProperty('criterion_general_wlb')
  })
})

