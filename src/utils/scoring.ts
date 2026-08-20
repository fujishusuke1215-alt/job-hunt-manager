import type { Company, EvaluationScores } from '../types'

const clamp = (value: number) => Math.min(5, Math.max(0, value))

export function calculateOverallScore(scores: EvaluationScores, interest: number): number {
  const compensation = (clamp(scores.salary) + clamp(scores.benefits)) / 2
  const flexibility = (clamp(scores.remote) + clamp(scores.flex)) / 2
  const weightedFivePointScore =
    compensation * 0.2 +
    clamp(scores.wlb) * 0.25 +
    flexibility * 0.15 +
    clamp(scores.overseas) * 0.1 +
    clamp(scores.itFit) * 0.15 +
    clamp(interest) * 0.15

  return Math.round(weightedFivePointScore * 20 * 10) / 10
}

export function rankCompanies(companies: Company[]): Company[] {
  return [...companies].sort(
    (a, b) => calculateOverallScore(b.scores, b.interest) - calculateOverallScore(a.scores, a.interest),
  )
}

