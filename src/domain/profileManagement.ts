import type { AppDataV2, Criterion, ScoringProfile } from './types'
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
  const canonical = data.scoringProfiles.find((profile) => profile.id === (data.canonicalScoringProfileId ?? data.activeScoringProfileId))
  const profile: ScoringProfile = {
    id,
    name: name.trim() || '新しい評価プロファイル',
    kind: 'custom',
    criteria: canonical?.criteria.map((item) => ({ ...item })) ?? [],
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
  return touch({
    ...data,
    scoringProfiles: [...data.scoringProfiles, profile],
    activeScoringProfileId: id,
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

  const canonicalId = data.canonicalScoringProfileId ?? data.activeScoringProfileId
  const canonical = data.scoringProfiles.find((profile) => profile.id === canonicalId)
  if (!canonical) throw new Error('基準となる企業評価が見つかりません。')
  const isCanonical = profileDraft.id === canonicalId
  const canonicalById = new Map(canonical.criteria.map((item) => [item.id, item]))
  if (!isCanonical && profileDraft.criteria.some((item) => !canonicalById.has(item.id))) {
    throw new Error('ランキングプロファイルでは評価項目を追加・削除できません。重み付けのみ変更できます。')
  }

  let evaluations = data.evaluations
  if (isCanonical) {
    for (const item of profileDraft.criteria) {
      const old = previous.criteria.find((candidate) => candidate.id === item.id)
      if (old && old.scaleMax !== item.scaleMax) {
        evaluations = rescaleCriterionValues(evaluations, item.id, old.scaleMax, item.scaleMax, now)
      }
    }
    const canonicalIds = new Set(profileDraft.criteria.map((item) => item.id))
    evaluations = evaluations.map((evaluation) => evaluation.scoringProfileId !== canonicalId ? evaluation : {
      ...evaluation,
      values: Object.fromEntries(Object.entries(evaluation.values).filter(([criterionId]) => canonicalIds.has(criterionId))),
      updatedAt: now,
    })
  }

  const nextProfile: ScoringProfile = {
    ...profileDraft,
    name: profileDraft.name.trim(),
    criteria: (isCanonical ? profileDraft.criteria : canonical.criteria.map((item) => ({
      ...item,
      weight: profileDraft.criteria.find((candidate) => candidate.id === item.id)?.weight ?? item.weight,
    }))).map((item, order) => ({ ...item, label: item.label.trim(), order })),
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
    scaleMax: 10,
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
  const canonicalId = data.canonicalScoringProfileId ?? data.activeScoringProfileId
  const profile = data.scoringProfiles.find((item) => item.id === canonicalId)
  const criterion = profile?.criteria.find((item) => item.id === criterionId)
  if (!profile || !criterion) throw new Error('評価項目が見つかりません。')
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > criterion.scaleMax)) {
    throw new Error(`評価は0から${criterion.scaleMax}までの整数で入力してください。`)
  }
  const normalized = value === null ? null : value
  const existing = data.evaluations.find(
    (evaluation) => evaluation.userCompanyId === userCompanyId && evaluation.scoringProfileId === canonicalId,
  )
  const evaluations = existing
    ? data.evaluations.map((evaluation) => evaluation.id === existing.id
      ? { ...evaluation, values: { ...evaluation.values, [criterionId]: normalized }, updatedAt: now }
      : evaluation)
    : [...data.evaluations, {
      id: `evaluation_${userCompanyId}_${profileId}`,
      userCompanyId,
      scoringProfileId: canonicalId,
      values: Object.fromEntries(profile.criteria.map((item) => [item.id, item.id === criterionId ? normalized : null])),
      createdAt: now,
      updatedAt: now,
    }]
  return touch({ ...data, evaluations }, now)
}
