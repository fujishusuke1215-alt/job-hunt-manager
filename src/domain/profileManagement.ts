import type { AppDataV2, CompanyEvaluation, Criterion, ScoringProfile } from './types'
import { cloneScoringProfile, rescaleCriterionValues } from './scoring'

const touch = (data: AppDataV2, now: string): AppDataV2 => ({
  ...data,
  revision: data.revision + 1,
  updatedAt: now,
})

export function createCustomProfile(
  data: AppDataV2,
  id: string,
  name: string,
  now = new Date().toISOString(),
): AppDataV2 {
  const profile: ScoringProfile = {
    id,
    name: name.trim() || '新しい評価プロファイル',
    kind: 'custom',
    criteria: [],
    createdAt: now,
    updatedAt: now,
  }
  return touch({ ...data, scoringProfiles: [...data.scoringProfiles, profile], activeScoringProfileId: id }, now)
}

export function duplicateProfile(
  data: AppDataV2,
  sourceProfileId: string,
  id: string,
  name: string,
  now = new Date().toISOString(),
): AppDataV2 {
  const source = data.scoringProfiles.find((profile) => profile.id === sourceProfileId)
  if (!source) throw new Error('複製元の評価プロファイルが見つかりません。')
  const profile = cloneScoringProfile(source, id, name.trim() || `${source.name} のコピー`, now)
  const idMap = new Map(source.criteria.map((item, index) => [item.id, profile.criteria[index].id]))
  const evaluations: CompanyEvaluation[] = [
    ...data.evaluations,
    ...data.evaluations
      .filter((evaluation) => evaluation.scoringProfileId === source.id)
      .map((evaluation) => ({
        ...evaluation,
        id: `${id}_${evaluation.userCompanyId}`,
        scoringProfileId: id,
        values: Object.fromEntries(
          Object.entries(evaluation.values).map(([criterionId, value]) => [idMap.get(criterionId) ?? criterionId, value]),
        ),
        createdAt: now,
        updatedAt: now,
      })),
  ]
  return touch({
    ...data,
    scoringProfiles: [...data.scoringProfiles, profile],
    activeScoringProfileId: id,
    evaluations,
  }, now)
}

export function setActiveProfile(
  data: AppDataV2,
  profileId: string,
  now = new Date().toISOString(),
): AppDataV2 {
  if (!data.scoringProfiles.some((profile) => profile.id === profileId)) {
    throw new Error('評価プロファイルが見つかりません。')
  }
  if (data.activeScoringProfileId === profileId) return data
  return touch({ ...data, activeScoringProfileId: profileId }, now)
}

export function saveProfileDraft(
  data: AppDataV2,
  profileDraft: ScoringProfile,
  now = new Date().toISOString(),
): AppDataV2 {
  const previous = data.scoringProfiles.find((profile) => profile.id === profileDraft.id)
  if (!previous) throw new Error('保存する評価プロファイルが見つかりません。')
  if (!profileDraft.name.trim()) throw new Error('プロファイル名を入力してください。')
  if (profileDraft.criteria.some((item) => !item.label.trim() || item.scaleMax <= 0 || item.weight < 0)) {
    throw new Error('項目名、最大点、weightを確認してください。')
  }

  let evaluations = data.evaluations
  for (const item of profileDraft.criteria) {
    const old = previous.criteria.find((candidate) => candidate.id === item.id)
    if (old && old.scaleMax !== item.scaleMax) {
      evaluations = rescaleCriterionValues(evaluations, item.id, old.scaleMax, item.scaleMax, now)
    }
  }

  const nextIds = new Set(profileDraft.criteria.map((item) => item.id))
  evaluations = evaluations.map((evaluation) => {
    if (evaluation.scoringProfileId !== profileDraft.id) return evaluation
    const values = Object.fromEntries(
      profileDraft.criteria.map((item) => [item.id, evaluation.values[item.id] ?? null]),
    )
    return { ...evaluation, values, updatedAt: now }
  })

  const nextProfile: ScoringProfile = {
    ...profileDraft,
    name: profileDraft.name.trim(),
    criteria: profileDraft.criteria
      .filter((item) => nextIds.has(item.id))
      .map((item, order) => ({ ...item, label: item.label.trim(), order })),
    updatedAt: now,
  }
  return touch({
    ...data,
    scoringProfiles: data.scoringProfiles.map((profile) => profile.id === nextProfile.id ? nextProfile : profile),
    evaluations,
  }, now)
}

export function addCriterionToProfile(
  profile: ScoringProfile,
  criterionId: string,
): ScoringProfile {
  const criterion: Criterion = {
    id: criterionId,
    label: '新しい評価項目',
    description: '',
    scaleMax: 5,
    weight: 10,
    enabled: true,
    order: profile.criteria.length,
  }
  return { ...profile, criteria: [...profile.criteria, criterion] }
}

export function moveCriterion(
  profile: ScoringProfile,
  criterionId: string,
  direction: -1 | 1,
): ScoringProfile {
  const current = profile.criteria.findIndex((item) => item.id === criterionId)
  const target = current + direction
  if (current < 0 || target < 0 || target >= profile.criteria.length) return profile
  const criteria = [...profile.criteria]
  const [item] = criteria.splice(current, 1)
  criteria.splice(target, 0, item)
  return { ...profile, criteria: criteria.map((candidate, order) => ({ ...candidate, order })) }
}

export function setEvaluationValue(
  data: AppDataV2,
  userCompanyId: string,
  profileId: string,
  criterionId: string,
  value: number | null,
  now = new Date().toISOString(),
): AppDataV2 {
  const profile = data.scoringProfiles.find((item) => item.id === profileId)
  const criterion = profile?.criteria.find((item) => item.id === criterionId)
  if (!profile || !criterion) throw new Error('評価項目が見つかりません。')
  const normalized = value === null ? null : Math.min(criterion.scaleMax, Math.max(0, value))
  const existing = data.evaluations.find(
    (evaluation) => evaluation.userCompanyId === userCompanyId && evaluation.scoringProfileId === profileId,
  )
  const evaluations = existing
    ? data.evaluations.map((evaluation) => evaluation.id === existing.id
      ? { ...evaluation, values: { ...evaluation.values, [criterionId]: normalized }, updatedAt: now }
      : evaluation)
    : [...data.evaluations, {
      id: `evaluation_${userCompanyId}_${profileId}`,
      userCompanyId,
      scoringProfileId: profileId,
      values: Object.fromEntries(profile.criteria.map((item) => [item.id, item.id === criterionId ? normalized : null])),
      createdAt: now,
      updatedAt: now,
    }]
  return touch({ ...data, evaluations }, now)
}

