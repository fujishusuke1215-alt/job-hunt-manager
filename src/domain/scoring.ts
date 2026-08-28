import type { CompanyEvaluation, Criterion, ScoringProfile, ScoreResult } from './types'

const roundOne = (value: number) => Math.round(value * 10) / 10
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const criterion = (
  id: string,
  label: string,
  description: string,
  weight: number,
  order: number,
  scaleMax = 10,
): Criterion => ({ id, label, description, scaleMax, weight, enabled: true, order })

export function createGeneralScoringProfile(now = new Date().toISOString()): ScoringProfile {
  return {
    id: 'profile_general_v2',
    name: 'バランス型',
    kind: 'built_in',
    criteria: [
      criterion('criterion_general_compensation', '給与・待遇', '給与水準と待遇の総合評価', 20, 0),
      criterion('criterion_general_wlb', 'ワークライフバランス', '休暇、残業、働きやすさ', 20, 1),
      criterion('criterion_general_role_fit', '仕事内容との一致', '希望する仕事との一致', 20, 2),
      criterion('criterion_general_flexibility', 'リモート・フレックス等の働き方', '場所と時間の柔軟性', 15, 3),
      criterion('criterion_general_benefits', '福利厚生', '住宅・休暇・手当等', 10, 4),
      criterion('criterion_general_location', '勤務地・転勤', '勤務地や転勤の考え方との一致', 5, 5),
      criterion('criterion_general_stability', '企業の安定性・将来性', '事業の安定性と将来性', 5, 6),
      criterion('criterion_general_global', '海外勤務・グローバルな機会', '海外に関わる機会', 5, 7),
    ],
    createdAt: now,
    updatedAt: now,
  }
}

export function createDeveloperReferenceProfile(now = new Date().toISOString()): ScoringProfile {
  return {
    id: 'profile_developer_reference_v2',
    name: '開発者参考テンプレート',
    kind: 'built_in',
    criteria: [
      criterion('criterion_ref_salary_growth', '給与水準・将来の伸び', '30〜50歳での給与の伸びを含む', 25, 0),
      criterion('criterion_ref_wlb', 'WLB', '休暇・残業・働きやすさ', 15, 1),
      criterion('criterion_ref_flexibility', 'リモート・フレックス', '場所と時間の柔軟性', 15, 2),
      criterion('criterion_ref_housing', '住宅・福利厚生', '住宅補助、社宅、手当等', 10, 3),
      criterion('criterion_ref_it_fit', 'IT/DX職との一致', '希望職種との一致', 8, 4),
      criterion('criterion_ref_overseas', '海外・東南アジア', '海外勤務や展開可能性', 8, 5),
      criterion('criterion_ref_eligibility', '応募確度', '28卒かつ職歴ありでの応募確度', 5, 6),
      criterion('criterion_ref_offer', '内定の現実性', '選考突破の現実性', 4, 7),
      criterion('criterion_ref_stability', '安定性・勤務地', '会社の安定性や勤務地', 10, 8),
    ],
    createdAt: now,
    updatedAt: now,
  }
}

export function createLegacyV1Profile(now = new Date().toISOString()): ScoringProfile {
  return {
    id: 'profile_legacy_v1',
    name: '以前の評価設定',
    kind: 'legacy',
    criteria: [
      criterion('criterion_legacy_salary', '給与', 'v1から移行', 10, 0, 5),
      criterion('criterion_legacy_benefits', '福利厚生', 'v1から移行', 10, 1, 5),
      criterion('criterion_legacy_wlb', 'ワークライフバランス', 'v1から移行', 25, 2, 5),
      criterion('criterion_legacy_remote', 'リモート', 'v1から移行', 7.5, 3, 5),
      criterion('criterion_legacy_flex', 'フレックス', 'v1から移行', 7.5, 4, 5),
      criterion('criterion_legacy_overseas', '海外可能性', 'v1から移行', 10, 5, 5),
      criterion('criterion_legacy_it_fit', 'IT/DX一致', 'v1から移行', 15, 6, 5),
      criterion('criterion_legacy_interest', '志望度', 'v1から移行', 15, 7, 5),
    ],
    createdAt: now,
    updatedAt: now,
  }
}

export function createEmptyAppProfiles(now = new Date().toISOString()): ScoringProfile[] {
  return [createGeneralScoringProfile(now), createDeveloperReferenceProfile(now)]
}

export function calculateScore(profile: ScoringProfile, evaluation: CompanyEvaluation | null): ScoreResult {
  const enabled = profile.criteria.filter((item) => item.enabled && item.weight > 0)
  const enabledWeight = enabled.reduce((sum, item) => sum + item.weight, 0)
  if (!evaluation || enabledWeight === 0) {
    return { score: null, coverage: 0, evaluatedWeight: 0, enabledWeight, provisional: false }
  }

  let weighted = 0
  let evaluatedWeight = 0
  for (const item of enabled) {
    const raw = evaluation.values[item.id]
    if (raw === null || raw === undefined || !Number.isFinite(raw)) continue
    weighted += (clamp(raw, 0, item.scaleMax) / item.scaleMax) * item.weight
    evaluatedWeight += item.weight
  }

  if (evaluatedWeight === 0) {
    return { score: null, coverage: 0, evaluatedWeight: 0, enabledWeight, provisional: false }
  }

  const coverage = roundOne((evaluatedWeight / enabledWeight) * 100)
  return {
    score: roundOne((weighted / evaluatedWeight) * 100),
    coverage,
    evaluatedWeight,
    enabledWeight,
    provisional: coverage < 100,
  }
}

export function rescaleCriterionValues(
  evaluations: CompanyEvaluation[],
  criterionId: string,
  previousMax: number,
  nextMax: number,
  now = new Date().toISOString(),
): CompanyEvaluation[] {
  if (previousMax <= 0 || nextMax <= 0) throw new Error('最大点は0より大きくしてください。')
  return evaluations.map((evaluation) => {
    const current = evaluation.values[criterionId]
    if (current === null || current === undefined) return evaluation
    return {
      ...evaluation,
      values: {
        ...evaluation.values,
        [criterionId]: roundOne(clamp((current / previousMax) * nextMax, 0, nextMax)),
      },
      updatedAt: now,
    }
  })
}

export function cloneScoringProfile(
  source: ScoringProfile,
  id: string,
  name: string,
  now = new Date().toISOString(),
): ScoringProfile {
  return {
    ...source,
    id,
    name,
    kind: 'custom',
    // Criterion ids are canonical company-rating keys. A profile copy is a
    // different weighting lens, never a second set of values to re-enter.
    criteria: source.criteria.map((item) => ({ ...item })),
    createdAt: now,
    updatedAt: now,
  }
}
