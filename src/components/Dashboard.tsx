import { selectionLabel, selectionStatusOptions } from '../domain/selection'
import type { CompanyView, WatchFinding } from '../domain/types'
import { rankCompanyViews } from '../domain/selectors'
import { buildTodayActions } from '../domain/watch'
import { deadlineTone, formatDeadlineLabel, getDaysUntil } from '../utils/deadlines'

interface DashboardProps {
  companies: CompanyView[]
  findings: WatchFinding[]
  onOpenCompany: (id: string) => void
  onAddCompany: () => void
  onOpenWatch: () => void
}

export function Dashboard({ companies, findings, onOpenCompany, onAddCompany, onOpenWatch }: DashboardProps) {
  const activeCount = companies.filter((view) => !['検討中', '内定', '終了'].includes(view.company.applicationStatus)).length
  const waitingCount = companies.filter((view) => view.company.applicationStatus === '結果待ち').length
  const sevenDayCount = companies.flatMap((view) => view.company.events).filter((event) => {
    if (['完了', '見送り'].includes(event.status)) return false
    const days = getDaysUntil(event.scheduledAt)
    return days !== null && days <= 7
  }).length
  const enabledCompanyIds = new Set(companies.filter((view) => view.company.watchEnabled).map((view) => view.company.id))
  const enabledFindings = findings.filter((finding) => enabledCompanyIds.has(finding.userCompanyId))
  const actions = buildTodayActions(companies.map((view) => view.company), enabledFindings, {
    companyNames: Object.fromEntries(companies.map((view) => [view.company.id, view.displayName])),
    companyScores: Object.fromEntries(companies.map((view) => [view.company.id, view.score.score])),
  })
  const topCompanies = rankCompanyViews(companies).slice(0, 4)

  return (
    <section className="page-stack" aria-labelledby="dashboard-title">
      <div className="page-heading">
        <div><p className="eyebrow">TODAY'S OVERVIEW</p><h1 id="dashboard-title">次に動くことが、ひと目で分かる。</h1><p>締切の緊急度と企業適合度を分けて、対応漏れを減らします。</p></div>
        <button className="primary-button" type="button" onClick={onAddCompany}>＋ 企業を登録</button>
      </div>

      <div className="metric-grid">
        <article className="metric-card featured"><span>登録企業</span><strong>{companies.length}</strong><small>比較対象を含む全企業</small></article>
        <article className="metric-card"><span>選考中</span><strong>{activeCount}</strong><small>現在対応が必要な企業</small></article>
        <article className="metric-card"><span>新しいWatch</span><strong>{enabledFindings.filter((item) => item.status === 'new').length}</strong><small>承認後に保存された発見</small></article>
        <article className="metric-card"><span>7日以内・超過</span><strong>{sevenDayCount}</strong><small>完了前の予定</small></article>
      </div>

      {companies.length === 0 ? (
        <div className="empty-state large"><span className="empty-symbol" aria-hidden="true">＋</span><h2>最初の企業を登録しましょう</h2><p>企業情報と応募情報を分けて、安全に管理します。</p><button className="primary-button" type="button" onClick={onAddCompany}>企業を登録</button></div>
      ) : (
        <div className="dashboard-grid">
          <article className="panel deadline-panel">
            <div className="panel-heading"><div><p className="eyebrow">TODAY'S ACTIONS</p><h2>今日の要対応</h2></div><span className="panel-count">{actions.length}件</span></div>
            <p className="panel-description">超過 → 24時間 → 3日 → 7日 → Watch重要度。同条件だけ適合度を使います。</p>
            <div className="deadline-list">
              {actions.length === 0 ? <p className="muted-message">未完了の予定・Watchはありません。</p> : actions.slice(0, 8).map((item) => (
                <button className="deadline-row" type="button" key={item.id} onClick={() => item.source === 'watch_finding' ? onOpenWatch() : onOpenCompany(item.userCompanyId)}>
                  <span className={`deadline-date ${item.deadline ? deadlineTone(item.deadline) : ''}`}><strong>{item.source === 'watch_finding' ? 'W' : new Date(item.deadline ?? '').getDate()}</strong><small>{item.source === 'watch_finding' ? 'WATCH' : new Date(item.deadline ?? '').toLocaleDateString('ja-JP', { month: 'short' })}</small></span>
                  <span className="deadline-copy"><strong>{item.companyName}</strong><small>{item.title}</small></span>
                  <span className={`deadline-badge ${item.deadline ? deadlineTone(item.deadline) : ''}`}>{item.deadline ? formatDeadlineLabel(item.deadline) : `Watch ${item.severity}`}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="panel ranking-panel">
            <div className="panel-heading"><div><p className="eyebrow">FIT RANKING</p><h2>企業適合度</h2></div></div>
            <p className="panel-description">締切の緊急度とは別の、自分の評価基準による順位です。</p>
            <ol className="ranking-list">
              {topCompanies.map((view) => (
                <li key={view.company.id}><button type="button" onClick={() => onOpenCompany(view.company.id)}><span className="rank-number">{view.rank}</span><span className="rank-company"><strong>{view.displayName}</strong><small>{view.score.provisional ? `暫定・充足率 ${view.score.coverage}%` : view.company.role || '職種未設定'}</small></span><span className="score-ring">{view.score.score === null ? '—' : view.score.score.toFixed(1)}</span></button></li>
              ))}
            </ol>
          </article>

          <article className="panel status-panel">
            <div className="panel-heading compact"><div><p className="eyebrow">PIPELINE</p><h2>選考ステータス</h2></div><span className="panel-count">結果待ち {waitingCount}</span></div>
            <div className="status-bars">
              {selectionStatusOptions.map((status) => {
                const count = companies.filter((view) => selectionLabel(view.company) === status).length
                if (count === 0) return null
                return <div className="status-bar-row" key={status}><div><span>{status}</span><strong>{count}</strong></div><span className="status-track"><span style={{ width: `${(count / companies.length) * 100}%` }} /></span></div>
              })}
            </div>
          </article>
        </div>
      )}
    </section>
  )
}
