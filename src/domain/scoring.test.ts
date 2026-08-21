import { describe, expect, it } from 'vitest'
import { calculateScore, rescaleCriterionValues } from './scoring'
import type { CompanyEvaluation, Criterion, ScoringProfile } from './types'

const timestamp = '2026-08-21T00:00:00.000Z'

function makeCriterion(id: string, overrides: Partial<Criterion> = {}): Criterion {
  return {
    id,
    label: id,
    description: '',
    scaleMax: 5,
    weight: 1,
    enabled: true,
    order: 0,
    ...overrides,
  }
}

function makeProfile(criteria: Criterion[]): ScoringProfile {
  return {
    id: 'profile_test',
    name: 'テスト用',
    kind: 'custom',
    criteria,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function makeEvaluation(
  values: Record<string, number | null>,
  overrides: Partial<CompanyEvaluation> = {},
): CompanyEvaluation {
  return {
    id: 'evaluation_test',
    userCompanyId: 'company_test',
    scoringProfileId: 'profile_test',
    values,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

describe('calculateScore', () => {
  it('有効な全項目が満点なら100点・充足率100%になる', () => {
    const profile = makeProfile([
      makeCriterion('salary', { scaleMax: 5, weight: 25 }),
      makeCriterion('wlb', { scaleMax: 5, weight: 15 }),
      makeCriterion('roleFit', { scaleMax: 5, weight: 60 }),
    ])

    expect(calculateScore(profile, makeEvaluation({ salary: 5, wlb: 5, roleFit: 5 }))).toEqual({
      score: 100,
      coverage: 100,
      evaluatedWeight: 100,
      enabledWeight: 100,
      provisional: false,
    })
  })

  it('項目ごとに異なるscaleMaxとweightを正規化して計算する', () => {
    const profile = makeProfile([
      makeCriterion('tenPoint', { scaleMax: 10, weight: 2 }),
      makeCriterion('fourPoint', { scaleMax: 4, weight: 6 }),
    ])

    const result = calculateScore(profile, makeEvaluation({ tenPoint: 7.5, fourPoint: 3 }))

    expect(result.score).toBe(75)
    expect(result.coverage).toBe(100)
  })

  it('weight合計が100でなくても比率として正規化する', () => {
    const profile = makeProfile([
      makeCriterion('full', { weight: 2 }),
      makeCriterion('zero', { weight: 3 }),
    ])

    const result = calculateScore(profile, makeEvaluation({ full: 5, zero: 0 }))

    expect(result.score).toBe(40)
    expect(result.enabledWeight).toBe(5)
    expect(result.evaluatedWeight).toBe(5)
  })

  it('disabledまたはweight 0の項目を点数と充足率から除外する', () => {
    const profile = makeProfile([
      makeCriterion('active', { weight: 10 }),
      makeCriterion('disabled', { weight: 90, enabled: false }),
      makeCriterion('zeroWeight', { weight: 0 }),
    ])

    expect(calculateScore(
      profile,
      makeEvaluation({ active: 5, disabled: 0, zeroWeight: 0 }),
    )).toEqual({
      score: 100,
      coverage: 100,
      evaluatedWeight: 10,
      enabledWeight: 10,
      provisional: false,
    })
  })

  it('nullを0点にせず、評価済み項目だけで暫定点と充足率を計算する', () => {
    const profile = makeProfile([
      makeCriterion('evaluated', { weight: 3 }),
      makeCriterion('notEvaluated', { weight: 1 }),
    ])

    expect(calculateScore(
      profile,
      makeEvaluation({ evaluated: 5, notEvaluated: null }),
    )).toEqual({
      score: 100,
      coverage: 75,
      evaluatedWeight: 3,
      enabledWeight: 4,
      provisional: true,
    })
  })

  it('評価済み項目が1件もなければ総合点を表示しない', () => {
    const profile = makeProfile([
      makeCriterion('one', { weight: 3 }),
      makeCriterion('two', { weight: 2 }),
    ])

    expect(calculateScore(profile, makeEvaluation({ one: null }))).toEqual({
      score: null,
      coverage: 0,
      evaluatedWeight: 0,
      enabledWeight: 5,
      provisional: false,
    })
  })

  it('項目名を変更してもCriterion IDが同じなら既存評価を保持する', () => {
    const original = makeProfile([
      makeCriterion('stable_id', { label: '変更前', weight: 10 }),
    ])
    const renamed: ScoringProfile = {
      ...original,
      criteria: original.criteria.map((item) => ({ ...item, label: '変更後' })),
    }
    const evaluation = makeEvaluation({ stable_id: 4 })

    expect(calculateScore(original, evaluation)).toEqual(calculateScore(renamed, evaluation))
    expect(evaluation.values.stable_id).toBe(4)
  })

  it('weight変更後は評価値を変えずに総合点を再計算する', () => {
    const original = makeProfile([
      makeCriterion('high', { weight: 1 }),
      makeCriterion('low', { weight: 1 }),
    ])
    const reweighted: ScoringProfile = {
      ...original,
      criteria: [
        { ...original.criteria[0], weight: 3 },
        { ...original.criteria[1], weight: 1 },
      ],
    }
    const evaluation = makeEvaluation({ high: 5, low: 0 })

    expect(calculateScore(original, evaluation).score).toBe(50)
    expect(calculateScore(reweighted, evaluation).score).toBe(75)
    expect(evaluation.values).toEqual({ high: 5, low: 0 })
  })
})

describe('rescaleCriterionValues', () => {
  it('scaleMax変更時に百分率を維持して既存値を比例変換する', () => {
    const evaluations = [
      makeEvaluation({ target: 4, untouched: 2 }),
      makeEvaluation(
        { target: null, untouched: 3 },
        { id: 'evaluation_null', userCompanyId: 'company_null' },
      ),
      makeEvaluation(
        { target: 8 },
        { id: 'evaluation_clamped', userCompanyId: 'company_clamped' },
      ),
    ]
    const updatedAt = '2026-08-21T09:00:00.000Z'

    const result = rescaleCriterionValues(evaluations, 'target', 5, 10, updatedAt)

    expect(result[0].values).toEqual({ target: 8, untouched: 2 })
    expect(result[0].updatedAt).toBe(updatedAt)
    expect(result[1]).toBe(evaluations[1])
    expect(result[1].values.target).toBeNull()
    expect(result[2].values.target).toBe(10)
    expect(evaluations[0].values.target).toBe(4)
  })

  it('0以下の旧最大点または新最大点を拒否する', () => {
    const evaluations = [makeEvaluation({ target: 4 })]

    expect(() => rescaleCriterionValues(evaluations, 'target', 0, 10)).toThrow('最大点')
    expect(() => rescaleCriterionValues(evaluations, 'target', 5, 0)).toThrow('最大点')
  })
})
