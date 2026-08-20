import type { Company } from '../types'
import { applicationStatuses } from '../types'
import { deadlineTone, formatDeadlineLabel, getMostUrgentEvent } from '../utils/deadlines'
import { calculateOverallScore, rankCompanies } from '../utils/scoring'

interface DashboardProps {
  companies: Company[]
  onOpenCompany: (id: string) => void
  onAddCompany: () => void
}

export function Dashboard({ companies, onOpenCompany, onAddCompany }: DashboardProps) {
  const activeCount = companies.filter((company) => !['検討中', '終了', '内定'].includes(company.status)).length
  const waitingCount = companies.filter((company) => company.status === '結果待ち').length
  const upcoming = companies
    .map((company) => ({ company, event: getMostUrgentEvent(company) }))
    .filter((item): item is { company: Company; event: NonNullable<typeof item.event> } => Boolean(item.event))
    .sort((a, b) => new Date(a.event.scheduledAt).getTime() - new Date(b.event.scheduledAt).getTime())
    .slice(0, 5)
  const topCompanies = rankCompanies(companies).slice(0, 4)

  return (
    <section className="page-stack" aria-labelledby="dashboard-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TODAY'S OVERVIEW</p>
          <h1 id="dashboard-title">次に動くことが、ひと目で分かる。</h1>
          <p>選考状況と締切をまとめて、対応漏れを減らします。</p>
        </div>
        <button className="primary-button" type="button" onClick={onAddCompany}>＋ 企業を登録</button>
      </div>

      <div className="metric-grid">
        <article className="metric-card featured">
          <span>登録企業</span>
          <strong>{companies.length}</strong>
          <small>比較対象を含む全企業</small>
        </article>
        <article className="metric-card">
          <span>選考中</span>
          <strong>{activeCount}</strong>
          <small>現在対応が必要な企業</small>
        </article>
        <article className="metric-card">
          <span>結果待ち</span>
          <strong>{waitingCount}</strong>
          <small>結果の連絡待ち</small>
        </article>
        <article className="metric-card">
          <span>7日以内</span>
          <strong>
            {upcoming.filter(({ event }) => ['soon', 'overdue'].includes(deadlineTone(event.scheduledAt))).length}
          </strong>
          <small>期限超過を含む要確認</small>
        </article>
      </div>

      {companies.length === 0 ? (
        <div className="empty-state large">
          <span className="empty-symbol" aria-hidden="true">＋</span>
          <h2>最初の企業を登録しましょう</h2>
          <p>本人用データはこのブラウザーだけに保存されます。</p>
          <button className="primary-button" type="button" onClick={onAddCompany}>企業を登録</button>
        </div>
      ) : (
        <div className="dashboard-grid">
          <article className="panel deadline-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">NEXT ACTIONS</p>
                <h2>直近の締切・予定</h2>
              </div>
              <span className="panel-count">{upcoming.length}件</span>
            </div>
            <div className="deadline-list">
              {upcoming.length === 0 ? (
                <p className="muted-message">未完了の予定はありません。</p>
              ) : upcoming.map(({ company, event }) => (
                <button className="deadline-row" type="button" key={event.id} onClick={() => onOpenCompany(company.id)}>
                  <span className={`deadline-date ${deadlineTone(event.scheduledAt)}`}>
                    <strong>{new Date(event.scheduledAt).getDate()}</strong>
                    <small>{new Date(event.scheduledAt).toLocaleDateString('ja-JP', { month: 'short' })}</small>
                  </span>
                  <span className="deadline-copy">
                    <strong>{company.name}</strong>
                    <small>{event.title}</small>
                  </span>
                  <span className={`deadline-badge ${deadlineTone(event.scheduledAt)}`}>
                    {formatDeadlineLabel(event.scheduledAt)}
                  </span>
                </button>
              ))}
            </div>
          </article>

          <article className="panel ranking-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">FIT RANKING</p>
                <h2>総合ランキング</h2>
              </div>
            </div>
            <ol className="ranking-list">
              {topCompanies.map((company, index) => (
                <li key={company.id}>
                  <button type="button" onClick={() => onOpenCompany(company.id)}>
                    <span className="rank-number">{index + 1}</span>
                    <span className="rank-company">
                      <strong>{company.name}</strong>
                      <small>{company.role}</small>
                    </span>
                    <span className="score-ring">{calculateOverallScore(company.scores, company.interest).toFixed(1)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </article>

          <article className="panel status-panel">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">PIPELINE</p>
                <h2>選考ステータス</h2>
              </div>
            </div>
            <div className="status-bars">
              {applicationStatuses.map((status) => {
                const count = companies.filter((company) => company.status === status).length
                if (count === 0) return null
                const percentage = companies.length ? (count / companies.length) * 100 : 0
                return (
                  <div className="status-bar-row" key={status}>
                    <div><span>{status}</span><strong>{count}</strong></div>
                    <span className="status-track"><span style={{ width: `${percentage}%` }} /></span>
                  </div>
                )
              })}
            </div>
          </article>
        </div>
      )}
    </section>
  )
}

