import {
  previewAiSync,
  type AiSyncPreview,
} from '../domain/aiSync'
import type { AppDataV2, CatalogData, MasterCompany } from '../domain/types'

export interface WatchContext {
  data: AppDataV2
  catalog?: CatalogData | MasterCompany[]
}

export interface WatchProvider {
  readonly id: string
  readonly kind: 'manual_ai_import' | 'gmail' | 'recruitment_web'
  preview(input: unknown, context: WatchContext): Promise<AiSyncPreview>
}

/** 今回実装する唯一のWatch Provider。外部巡回はせず、利用者が渡したJSONだけを扱います。 */
export class ManualAiImportWatchProvider implements WatchProvider {
  readonly id = 'manual-ai-import-v1'
  readonly kind = 'manual_ai_import' as const

  preview(input: unknown, context: WatchContext): Promise<AiSyncPreview> {
    return Promise.resolve(previewAiSync(input, context.data, context.catalog))
  }
}

/** 将来バックエンド・Restricted scope・審査を検討した後に実装するためのcontractです。 */
export interface GmailWatchProvider extends WatchProvider {
  readonly kind: 'gmail'
  readonly requiresBackendScheduler: true
}

/** 将来の定期Web調査実装が満たすcontractです。現時点の実装クラスはありません。 */
export interface RecruitmentWebWatchProvider extends WatchProvider {
  readonly kind: 'recruitment_web'
  readonly requiresBackendScheduler: true
}
