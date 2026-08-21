import { useMemo, useState } from 'react'
import type { CompanyView, WatchFinding, WatchFindingStatus, WatchRun, WatchSeverity } from '../domain/types'
import { watchFindingStatuses, watchSeverities } from '../domain/types'

interface WatchCenterProps {
  companies: CompanyView[]
  findings: WatchFinding[]
  runs: WatchRun[]
  onStatusChange: (id: string, status: WatchFindingStatus) => void
  onOpenCompany: (id: string) => void
}

const severityLabels: Record<WatchSeverity, string> = { high: '高', medium: '中', low: '低' }

export function WatchCenter({ companies, findings, runs, onStatusChange, onOpenCompany }: WatchCenterProps) {
  const [status, setStatus] = useState<WatchFindingStatus | 'all'>('all')
  const [severity, setSeverity] = useState<WatchSeverity | 'all'>('all')
  const [companyId, setCompanyId] = useState('all')
  const nameById = useMemo(() => new Map(companies.map((view) => [view.company.id, view.displayName])), [companies])
  const visible = useMemo(() => [...findings].filter((item) => {
    if (status !== 'all' && item.status !== status) return false
    if (severity !== 'all' && item.severity !== severity) return false
    if (companyId !== 'all' && item.userCompanyId !== companyId) return false
    return true
  }).sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 }
    return severityOrder[a.severity] - severityOrder[b.severity] || new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime() || a.id.localeCompare(b.id)
  }), [companyId, findings, severity, status])
  const lastRun = [...runs].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]

  return (
    <section className="page-stack" aria-labelledby="watch-title">
      <div className="page-heading compact-heading"><div><p className="eyebrow">WATCH CENTER</p><h1 id="watch-title">採用情報Watch</h1><p>AI Syncで承認した変化を保存し、確認・完了まで追跡します。</p></div></div>
      <div className="notice" role="note">現在は手動AI JSON取込だけです。Gmailや採用Webの自動巡回、バックグラウンド定期実行はまだありません。</div>

      <div className="metric-grid">
        <article className="metric-card featured"><span>新しい発見</span><strong>{findings.filter((item) => item.status === 'new').length}</strong><small>未確認</small></article>
        <article className="metric-card"><span>要対応</span><strong>{findings.filter((item) => ['new', 'seen'].includes(item.status)).length}</strong><small>new + seen</small></article>
        <article className="metric-card"><span>完了</span><strong>{findings.filter((item) => item.status === 'completed').length}</strong><small>再取込でもnewへ戻しません</small></article>
        <article className="metric-card"><span>最終Watch</span><strong className="metric-date">{lastRun ? new Date(lastRun.completedAt).toLocaleDateString('ja-JP') : '—'}</strong><small>{lastRun?.provider ?? '履歴なし'}</small></article>
      </div>

      <div className="watch-filters">
        <label className="field"><span>状態</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">すべて</option>{watchFindingStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="field"><span>重要度</span><select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}><option value="all">すべて</option>{watchSeverities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="field"><span>企業</span><select value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="all">すべて</option>{companies.map((view) => <option key={view.company.id} value={view.company.id}>{view.displayName}</option>)}</select></label>
      </div>

      {visible.length === 0 ? <div className="empty-state"><h2>該当するWatch Findingはありません</h2><p>AI同期で候補を承認すると、ここへ表示されます。</p></div> : (
        <div className="watch-list">
          {visible.map((finding) => (
            <article className={`watch-card severity-${finding.severity}`} key={finding.id}>
              <div className="watch-card-heading"><div className="chip-row"><span className={`severity-badge ${finding.severity}`}>重要度 {severityLabels[finding.severity]}</span><span className="status-chip">{finding.status}</span><span className="eligibility-chip">{finding.type}</span></div><time>{new Date(finding.detectedAt).toLocaleString('ja-JP')}</time></div>
              <button className="watch-company-link" type="button" onClick={() => onOpenCompany(finding.userCompanyId)}>{nameById.get(finding.userCompanyId) ?? '企業未特定'}</button>
              <h2>{finding.title}</h2><p>{finding.summary}</p>
              {finding.deadline && <p className="watch-deadline"><strong>期限</strong> {new Date(finding.deadline).toLocaleString('ja-JP')}</p>}
              {finding.source && <details><summary>根拠を見る</summary><p>{finding.source.title} / {finding.source.type}</p>{finding.source.url && <a href={finding.source.url} target="_blank" rel="noreferrer">出典を開く ↗</a>}</details>}
              <div className="card-actions"><button type="button" onClick={() => onStatusChange(finding.id, 'seen')}>確認済み</button><button type="button" onClick={() => onStatusChange(finding.id, 'completed')}>完了</button><button type="button" onClick={() => onStatusChange(finding.id, 'dismissed')}>非表示</button></div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
