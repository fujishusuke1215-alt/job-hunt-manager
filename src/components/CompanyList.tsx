import { useMemo } from 'react'
import { eligibilityOptions } from '../domain/types'
import type { CompanyFilters, CompanyView, ScoringProfile } from '../domain/types'
import { deadlineTone, formatDeadlineLabel, getDaysUntil, getMostUrgentEvent } from '../utils/deadlines'
import { selectionLabel, selectionStatusOptions } from '../domain/selection'

interface CompanyListProps {
  companies: CompanyView[]
  filters: CompanyFilters
  onFiltersChange: (filters: CompanyFilters) => void
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onAdd: () => void
  profile: ScoringProfile
}

function filterAndSort(views: CompanyView[], filters: CompanyFilters, profile: ScoringProfile) {
  const query = filters.query.trim().toLocaleLowerCase('ja')
  return [...views].filter((view) => {
    const searchable = [
      view.displayName,
      view.company.userEnteredName,
      view.company.role,
      view.company.applicationCategory,
      view.company.memo,
      ...view.facts.flatMap((fact) => [fact.label, fact.value]),
    ].join(' ').toLocaleLowerCase('ja')
    if (query && !searchable.includes(query)) return false
    if (filters.status !== 'すべて' && selectionLabel(view.company) !== filters.status) return false
    if (filters.priority !== 'すべて' && view.company.manualPriority !== filters.priority) return false
    if (filters.eligibility !== 'すべて' && !view.facts.some((fact) => fact.value === filters.eligibility)) return false
    const urgent = getMostUrgentEvent(view.company)
    const days = urgent ? getDaysUntil(urgent.scheduledAt) : null
    if (filters.deadline === '7日以内' && !(days !== null && days >= 0 && days <= 7)) return false
    if (filters.deadline === '期限超過' && !(days !== null && days < 0)) return false
    if (filters.deadline === '期限なし' && days !== null) return false
    return true
  }).sort((a, b) => {
    if (filters.sort.startsWith('評価項目:')) {
      const criterionId = filters.sort.slice('評価項目:'.length)
      const criterion = profile.criteria.find((item) => item.id === criterionId)
      const aValue = a.evaluation?.values[criterionId] ?? null
      const bValue = b.evaluation?.values[criterionId] ?? null
      if (aValue === null && bValue === null) return a.displayName.localeCompare(b.displayName, 'ja')
      if (aValue === null) return 1
      if (bValue === null) return -1
      // Scale differences are normalized defensively although canonical profiles
      // share the same definition.
      const aScore = criterion ? aValue / criterion.scaleMax : aValue
      const bScore = criterion ? bValue / criterion.scaleMax : bValue
      return bScore - aScore || a.displayName.localeCompare(b.displayName, 'ja')
    }
    if (filters.sort === '総合点が高い順') {
      if (a.score.score === null && b.score.score === null) return a.displayName.localeCompare(b.displayName, 'ja')
      if (a.score.score === null) return 1
      if (b.score.score === null) return -1
      return b.score.score - a.score.score
        || b.score.coverage - a.score.coverage
        || (a.evaluation?.sourceRank ?? Number.MAX_SAFE_INTEGER) - (b.evaluation?.sourceRank ?? Number.MAX_SAFE_INTEGER)
        || a.displayName.localeCompare(b.displayName, 'ja')
    }
    if (filters.sort === '更新が新しい順') return new Date(b.company.updatedAt).getTime() - new Date(a.company.updatedAt).getTime()
    if (filters.sort === '企業名順') return a.displayName.localeCompare(b.displayName, 'ja')
    const aDate = getMostUrgentEvent(a.company)?.scheduledAt
    const bDate = getMostUrgentEvent(b.company)?.scheduledAt
    if (!aDate && !bDate) return a.displayName.localeCompare(b.displayName, 'ja')
    if (!aDate) return 1
    if (!bDate) return -1
    return new Date(aDate).getTime() - new Date(bDate).getTime()
  })
}

export function CompanyList({ companies, filters, onFiltersChange, onOpen, onEdit, onDelete, onAdd, profile }: CompanyListProps) {
  const visible = useMemo(() => filterAndSort(companies, filters, profile), [companies, filters, profile])
  const update = <K extends keyof CompanyFilters>(key: K, value: CompanyFilters[K]) => onFiltersChange({ ...filters, [key]: value })
  const selectedCriterion = filters.sort.startsWith('評価項目:') ? profile.criteria.find((item) => item.id === filters.sort.slice('評価項目:'.length)) ?? null : null

  return (
    <section className="page-stack" aria-labelledby="companies-title">
      <div className="page-heading compact-heading">
        <div><p className="eyebrow">COMPANIES &amp; SELECTIONS</p><h1 id="companies-title">企業・選考管理</h1><p>{companies.length}社から、選考・評価・根拠情報をまとめて検索します。</p></div>
        <button className="primary-button" type="button" onClick={onAdd}>＋ 企業を登録</button>
      </div>

      <div className="filter-panel">
        <label className="search-field"><span className="sr-only">企業を検索</span><span aria-hidden="true">⌕</span><input value={filters.query} onChange={(event) => update('query', event.target.value)} placeholder="企業名・職種・メモ・調査情報を検索" /></label>
        <label><span>現在の選考状況</span><select value={filters.status} onChange={(event) => update('status', event.target.value as CompanyFilters['status'])}><option>すべて</option>{selectionStatusOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>応募資格Fact</span><select value={filters.eligibility} onChange={(event) => update('eligibility', event.target.value as CompanyFilters['eligibility'])}><option>すべて</option>{eligibilityOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>締切</span><select value={filters.deadline} onChange={(event) => update('deadline', event.target.value as CompanyFilters['deadline'])}><option>すべて</option><option>7日以内</option><option>期限超過</option><option>期限なし</option></select></label>
        <label><span>並び替え</span><select value={filters.sort} onChange={(event) => update('sort', event.target.value as CompanyFilters['sort'])}><option>締切が近い順</option><option>総合点が高い順</option><option>更新が新しい順</option><option>企業名順</option>{[...profile.criteria].sort((a, b) => a.order - b.order).filter((item) => item.enabled).map((item) => <option key={item.id} value={`評価項目:${item.id}`}>{item.label}が高い順</option>)}</select></label>
      </div>

      <p className="results-line"><strong>{visible.length}</strong>件を表示<button type="button" onClick={() => onFiltersChange({ query: '', status: 'すべて', priority: 'すべて', eligibility: 'すべて', deadline: 'すべて', sort: '締切が近い順' })}>条件をリセット</button></p>
      {visible.length === 0 ? <div className="empty-state"><h2>条件に合う企業がありません</h2><p>検索条件を変更するか、新しい企業を登録してください。</p></div> : (
        <div className="company-grid">
          {visible.map((view) => {
            const urgent = getMostUrgentEvent(view.company)
            return (
              <article className="company-card" key={view.company.id}>
                <button className="company-card-main" type="button" onClick={() => onOpen(view.company.id)}>
                  <div className="company-card-topline">
                    <span className="company-score"><strong>{view.score.score === null ? '—' : view.score.score.toFixed(1)}</strong><small> / 100</small></span>
                  </div>
                  <h2>{view.displayName}</h2>
                  <p>{view.company.role || '職種未設定'} · {view.master ? 'Master連携' : '独自企業'}</p>
                  <div className="chip-row"><span className="status-chip">{selectionLabel(view.company)}</span>{view.score.provisional && <span className="eligibility-chip">暫定・充足率 {view.score.coverage}%</span>}</div>
                  {selectedCriterion && <p className="criterion-sort-value">{selectedCriterion.label}: <strong>{view.evaluation?.values[selectedCriterion.id] ?? '未評価'}</strong>{view.evaluation?.values[selectedCriterion.id] !== null && view.evaluation?.values[selectedCriterion.id] !== undefined ? ` / ${selectedCriterion.scaleMax}` : ''}</p>}
                  <div className="card-deadline">
                    {urgent ? <><span className={`deadline-pip ${deadlineTone(urgent.scheduledAt)}`} /><span><strong>{urgent.title}</strong><small>{new Date(urgent.scheduledAt).toLocaleString('ja-JP')}</small></span><em className={deadlineTone(urgent.scheduledAt)}>{formatDeadlineLabel(urgent.scheduledAt)}</em></> : <span className="no-deadline">未完了の予定なし</span>}
                  </div>
                </button>
                <div className="card-actions"><button type="button" onClick={() => onEdit(view.company.id)}>編集</button><button className="danger-link" type="button" onClick={() => onDelete(view.company.id)}>削除</button></div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
