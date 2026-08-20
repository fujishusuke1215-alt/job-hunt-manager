import type { Company, CompanyFilters } from '../types'
import { applicationStatuses, eligibilityOptions, priorities } from '../types'
import { defaultFilters } from '../data/defaults'
import { deadlineTone, formatDeadlineLabel, getMostUrgentEvent } from '../utils/deadlines'
import { calculateOverallScore } from '../utils/scoring'

interface CompanyListProps {
  companies: Company[]
  filters: CompanyFilters
  totalCount: number
  onFiltersChange: (filters: CompanyFilters) => void
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onAdd: () => void
}

export function CompanyList({
  companies,
  filters,
  totalCount,
  onFiltersChange,
  onOpen,
  onEdit,
  onDelete,
  onAdd,
}: CompanyListProps) {
  const update = <K extends keyof CompanyFilters>(key: K, value: CompanyFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  return (
    <section className="page-stack" aria-labelledby="companies-title">
      <div className="page-heading compact-heading">
        <div>
          <p className="eyebrow">COMPANIES &amp; SELECTIONS</p>
          <h1 id="companies-title">企業・選考管理</h1>
          <p>{totalCount}社の情報から、条件に合う企業をすばやく探します。</p>
        </div>
        <button className="primary-button" type="button" onClick={onAdd}>＋ 企業を登録</button>
      </div>

      <div className="filter-panel">
        <label className="search-field">
          <span className="sr-only">企業を検索</span>
          <span aria-hidden="true">⌕</span>
          <input
            value={filters.query}
            onChange={(event) => update('query', event.target.value)}
            placeholder="企業名・職種・メモを検索"
          />
        </label>
        <label>
          <span>ステータス</span>
          <select value={filters.status} onChange={(event) => update('status', event.target.value as CompanyFilters['status'])}>
            <option>すべて</option>
            {applicationStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label>
          <span>優先度</span>
          <select value={filters.priority} onChange={(event) => update('priority', event.target.value as CompanyFilters['priority'])}>
            <option>すべて</option>
            {priorities.map((priority) => <option key={priority}>{priority}</option>)}
          </select>
        </label>
        <label>
          <span>応募資格</span>
          <select value={filters.eligibility} onChange={(event) => update('eligibility', event.target.value as CompanyFilters['eligibility'])}>
            <option>すべて</option>
            {eligibilityOptions.map((eligibility) => <option key={eligibility}>{eligibility}</option>)}
          </select>
        </label>
        <label>
          <span>締切</span>
          <select value={filters.deadline} onChange={(event) => update('deadline', event.target.value as CompanyFilters['deadline'])}>
            <option>すべて</option>
            <option>7日以内</option>
            <option>期限超過</option>
            <option>期限なし</option>
          </select>
        </label>
        <label>
          <span>並び順</span>
          <select value={filters.sort} onChange={(event) => update('sort', event.target.value as CompanyFilters['sort'])}>
            <option>締切が近い順</option>
            <option>総合点が高い順</option>
            <option>更新が新しい順</option>
            <option>企業名順</option>
          </select>
        </label>
      </div>

      <div className="results-line">
        <strong>{companies.length}社</strong><span>を表示</span>
        {companies.length !== totalCount && (
          <button type="button" onClick={() => onFiltersChange(defaultFilters)}>条件をクリア</button>
        )}
      </div>

      {companies.length === 0 ? (
        <div className="empty-state">
          <h2>条件に一致する企業がありません</h2>
          <p>検索語や絞り込み条件を変更してください。</p>
        </div>
      ) : (
        <div className="company-grid">
          {companies.map((company) => {
            const event = getMostUrgentEvent(company)
            const score = calculateOverallScore(company.scores, company.interest)
            return (
              <article className="company-card" key={company.id}>
                <button className="company-card-main" type="button" onClick={() => onOpen(company.id)}>
                  <div className="company-card-topline">
                    <span className={`priority priority-${company.priority.toLowerCase()}`}>優先度 {company.priority}</span>
                    <span className="company-score"><strong>{score.toFixed(1)}</strong><small>/100</small></span>
                  </div>
                  <h2>{company.name}</h2>
                  <p>{company.role || '職種未設定'}</p>
                  <div className="chip-row">
                    <span className="status-chip">{company.status}</span>
                    <span className="eligibility-chip">既卒 {company.existingGraduateEligibility}</span>
                  </div>
                  <div className="card-deadline">
                    {event ? (
                      <>
                        <span className={`deadline-pip ${deadlineTone(event.scheduledAt)}`} />
                        <span><strong>{event.title}</strong><small>{new Date(event.scheduledAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></span>
                        <em className={deadlineTone(event.scheduledAt)}>{formatDeadlineLabel(event.scheduledAt)}</em>
                      </>
                    ) : <span className="no-deadline">次の予定は未登録</span>}
                  </div>
                </button>
                <div className="card-actions">
                  <button type="button" onClick={() => onEdit(company.id)}>編集</button>
                  <button className="danger-link" type="button" onClick={() => onDelete(company.id)}>削除</button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

