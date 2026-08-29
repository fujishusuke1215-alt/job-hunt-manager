import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalIsoDateTime } from '../domain/dateTime'
import { parseAppDataV2 } from '../domain/schemas'
import type { AppDataV2 } from '../domain/types'
import type { CollectorFinding } from '../services/collectorFindings'
import {
  createConflictBackup,
  createImportPreview,
  serializeAppDataV2,
  StorageRepositoryError,
  type ImportPreview,
  type StorageConflict,
  type StorageLoadResult,
  type StorageRepository,
  type StorageSaveResult,
} from './types'

interface Row { user_id: string; app_data: unknown; revision: number; created_at: string; updated_at: string }
export interface CollectorStateSummary { collectorType: string; lastAttempt: string | null; lastSuccess: string | null; failureCount: number; lastErrorCategory: string | null; gmailAccount?: string | null }

export class SupabaseStorageRepository implements StorageRepository {
  constructor(private readonly client: SupabaseClient, private readonly userId: string) {}

  async exists(): Promise<boolean> {
    const { count, error } = await this.client.from('user_app_data').select('*', { count: 'exact', head: true }).eq('user_id', this.userId)
    if (error) throw this.error(error.message)
    return (count ?? 0) > 0
  }

  async load(): Promise<StorageLoadResult> {
    const { data, error } = await this.client.from('user_app_data').select('*').eq('user_id', this.userId).maybeSingle<Row>()
    if (error) throw this.error(error.message)
    if (!data) return { status: 'empty', source: 'supabase', data: null, version: null }
    const appData = this.parse(data.app_data)
    return { status: 'loaded', source: 'supabase', data: appData, version: String(data.revision), remoteFile: this.info(data), migratedFromV1: false, legacyBackup: null }
  }

  async save(data: AppDataV2, expectedVersion?: string): Promise<StorageSaveResult> {
    const validated = parseAppDataV2(data)
    const expected = expectedVersion === undefined ? null : Number(expectedVersion)
    if (expected !== null && (!Number.isInteger(expected) || expected < 0)) throw this.error('保存revisionが不正です。')
    const { data: saved, error } = await this.client.rpc('save_user_app_data', {
      expected_revision: expected,
      next_app_data: { ...validated, revision: Math.max(0, expected ?? 0), updatedAt: new Date().toISOString() },
    }).maybeSingle<Row>()
    if (error) {
      if (error.code === 'P0001' || /revision/i.test(error.message)) return this.conflict(validated)
      throw this.error(error.message)
    }
    if (!saved) return this.conflict(validated)
    const appData = this.parse(saved.app_data)
    return { status: 'saved', source: 'supabase', data: appData, version: String(saved.revision), remoteFile: this.info(saved) }
  }

  exportBackup(data: AppDataV2): string { return serializeAppDataV2(data) }
  async importBackup(raw: string): Promise<ImportPreview> { return createImportPreview(raw) }
  async commitImport(preview: ImportPreview, expectedVersion?: string): Promise<StorageSaveResult> { return this.save(createImportPreview(preview.raw).data, expectedVersion) }

  async syncMonitoringTargets(targets: readonly { candidateCompanyId: string; canonicalName: string; aliases: string[]; officialUrl: string | null; mypageUrl: string | null; senderDomains: string[]; status: string; workHistoryEligibility: string; eligibilitySourceUrl: string | null; eligibilityCheckedAt: string | null; eligibilityEvidence: string | null; enabled: boolean }[]): Promise<void> {
    const rows = targets.map((target) => ({ candidate_company_id: target.candidateCompanyId, canonical_name: target.canonicalName, aliases: target.aliases, official_url: target.officialUrl, mypage_url: target.mypageUrl, sender_domains: target.senderDomains, status: target.status, work_history_eligibility: target.workHistoryEligibility, eligibility_source_url: target.eligibilitySourceUrl, eligibility_checked_at: target.eligibilityCheckedAt, eligibility_evidence: target.eligibilityEvidence, enabled: target.enabled }))
    if (!rows.length) return
    const { error } = await this.client.rpc('sync_monitoring_targets', { targets: rows })
    if (error) throw this.error(error.message)
  }
  async queueLimitedGmailBackfill(candidateCompanyId: string): Promise<void> {
    const { error } = await this.client.rpc('queue_gmail_backfill', { p_candidate_company_id: candidateCompanyId })
    if (error) throw this.error(error.message)
  }

  async loadCollectorFindings(): Promise<CollectorFinding[]> {
    const { data, error } = await this.client.from('collector_findings').select('*').eq('user_id', this.userId).order('observed_at', { ascending: false }).limit(500)
    if (error) throw this.error(error.message)
    return (data ?? []).map((row: Record<string, unknown>) => ({ id: String(row.id), company: typeof row.company === 'string' ? row.company : null, findingType: String(row.finding_type), payload: (row.payload ?? {}) as Record<string, unknown>, sourceType: row.source_type as CollectorFinding['sourceType'], sourceExternalId: typeof row.source_external_id === 'string' ? row.source_external_id : null, sourceUrl: typeof row.source_url === 'string' ? row.source_url : null, sourceTimestamp: canonicalIsoDateTime(row.source_timestamp), observedAt: String(row.observed_at), confidence: Number(row.confidence), evidenceExcerpt: String(row.evidence_excerpt), fingerprint: String(row.fingerprint), status: row.status as CollectorFinding['status'], reviewReason: typeof row.review_reason === 'string' ? row.review_reason : null, triageAction: typeof row.triage_action === 'string' ? row.triage_action as CollectorFinding['triageAction'] : null, triageReason: typeof row.triage_reason === 'string' ? row.triage_reason : null, triageConfidence: typeof row.triage_confidence === 'number' ? row.triage_confidence : null }))
  }
  async loadCollectorStates(): Promise<CollectorStateSummary[]> {
    const { data, error } = await this.client.from('collector_state').select('collector_type,last_attempt,last_success,failure_count,last_error_category,cursor').eq('user_id', this.userId)
    if (error) throw this.error(error.message)
    return (data ?? []).map((row: Record<string, unknown>) => { const cursor = row.cursor as Record<string, unknown> | null; return { collectorType: String(row.collector_type), lastAttempt: typeof row.last_attempt === 'string' ? row.last_attempt : null, lastSuccess: typeof row.last_success === 'string' ? row.last_success : null, failureCount: Number(row.failure_count ?? 0), lastErrorCategory: typeof row.last_error_category === 'string' ? row.last_error_category : null, gmailAccount: cursor?.account_verified === true && typeof cursor.gmail_account === 'string' ? cursor.gmail_account : null } })
  }
  async setCollectorFindingStatus(id: string, status: 'approved' | 'rejected'): Promise<void> { const { error } = await this.client.from('collector_findings').update({ status, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', this.userId).in('status', ['new', 'needs_review']); if (error) throw this.error(error.message) }

  private parse(value: unknown): AppDataV2 {
    try { return parseAppDataV2(value) } catch (cause) { throw new StorageRepositoryError('invalid-remote-data', 'Supabaseの保存データ検証に失敗しました。上書きしていません。', { cause }) }
  }
  private info(row: Row) { return { id: row.user_id, name: 'user_app_data', version: String(row.revision), modifiedTime: row.updated_at } }
  private error(message: string) { return new StorageRepositoryError('supabase-request-failed', `Supabase保存先に接続できません: ${message}`) }
  private async conflict(data: AppDataV2): Promise<StorageSaveResult> {
    const loaded = await this.load()
    const remote = loaded.status === 'loaded' ? loaded.data : null
    const conflict: StorageConflict = { reason: 'remote-changed', message: '別の端末またはタブで更新されています。再読込して差分を確認してください。', remoteFiles: loaded.status === 'loaded' && loaded.remoteFile ? [loaded.remoteFile] : [], remoteData: remote, localBackup: createConflictBackup(data) }
    return { status: 'conflict', source: 'supabase', data, version: null, conflict }
  }
}
