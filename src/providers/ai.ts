import type { AiSyncEnvelopeV1 } from '../domain/aiSync'

export interface AiAnalysisRequest {
  prompt: string
  input: unknown
}

/**
 * 将来の外部AI連携が満たす境界です。
 * v2は有料AI APIを呼ばず、AiSyncEnvelopeV1の手動importだけを実装します。
 */
export interface AiProvider {
  readonly id: string
  analyze(request: AiAnalysisRequest): Promise<unknown>
  normalize(output: unknown): Promise<AiSyncEnvelopeV1>
}
