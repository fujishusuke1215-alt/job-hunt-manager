import { useState } from 'react'
import type { CompanyView, ResearchFact, ScoringProfile, SelectionEvent } from '../domain/types'
import { eventStatuses, eventTypes } from '../domain/types'
import { deadlineTone, formatDeadlineLabel } from '../utils/deadlines'
import { createId } from '../utils/id'
import { ResearchFactsPanel } from './ResearchFactsPanel'

interface CompanyDetailProps {
  view: CompanyView
  profile: ScoringProfile
  onClose: () => void
  onEdit: () => void
  onUpdateEvents: (events: SelectionEvent[]) => void
  onSaveFact: (fact: ResearchFact) => void
}

const blankEvent = (): Omit<SelectionEvent, 'id'> => ({
  type: '面接',
  title: '',
  scheduledAt: '',
  status: '予定',
  location: '',
  memo: '',
})

export function CompanyDetail({ view, profile, onClose, onEdit, onUpdateEvents, onSaveFact }: CompanyDetailProps) {
  const { company } = view
  const [draft, setDraft] = useState(blankEvent)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const submitEvent = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.title.trim() || !draft.scheduledAt) {
      setError('予定名と日時を入力してください。')
      return
    }
    const next = editingId
      ? company.events.map((item) => item.id === editingId ? { ...draft, title: draft.title.trim(), id: editingId } : item)
      : [...company.events, { ...draft, title: draft.title.trim(), id: createId('event') }]
    onUpdateEvents(next)
    setDraft(blankEvent())
    setEditingId(null)
    setError('')
  }

  const startEdit = (event: SelectionEvent) => {
    const { id, ...values } = event
    setEditingId(id)
    setDraft(values)
  }

  const deleteEvent = (id: string) => {
    if (window.confirm('この選考予定を削除しますか？')) onUpdateEvents(company.events.filter((event) => event.id !== id))
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="company-detail-title">
        <div className="detail-hero">
          <div>
            <div className="chip-row"><span className={`priority priority-${company.manualPriority.toLowerCase()}`}>優先度 {company.manualPriority}</span><span className="status-chip">{company.applicationStatus}</span><span className="eligibility-chip">{view.master ? 'Master連携' : '独自企業'}</span></div>
            <h2 id="company-detail-title">{view.displayName}</h2>
            <p>{company.role || '職種未設定'} · {company.applicationCategory || '応募区分未設定'}</p>
          </div>
          <div className="detail-score"><span>{view.score.provisional ? '暫定' : '総合点'}</span><strong>{view.score.score === null ? '—' : view.score.score.toFixed(1)}</strong><small>充足率 {view.score.coverage}%</small></div>
          <button className="icon-button light" type="button" onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <div className="detail-body">
          <div className="detail-toolbar">
            <div className="interest-stars" aria-label={`志望度 ${company.interest} / 5`}><span>志望度</span><strong>{'★'.repeat(company.interest)}{'☆'.repeat(5 - company.interest)}</strong></div>
            <button className="secondary-button" type="button" onClick={onEdit}>企業情報を編集</button>
          </div>

          <div className="detail-grid">
            <section className="detail-section">
              <h3>応募・紐付け情報</h3>
              <dl className="fact-list">
                <div><dt>入力名</dt><dd>{company.userEnteredName}</dd></div>
                <div><dt>Master ID</dt><dd>{company.masterCompanyId ?? '未紐付け'}</dd></div>
                <div><dt>MyPage</dt><dd>{company.myPageStatus}</dd></div>
                <div><dt>Watch</dt><dd>{company.watchEnabled ? '有効' : '無効'}</dd></div>
              </dl>
              {company.applicationUrl && <a className="external-link" href={company.applicationUrl} target="_blank" rel="noreferrer">応募ページを開く ↗</a>}
            </section>

            <section className="detail-section score-breakdown">
              <h3>{profile.name} の評価内訳</h3>
              {[...profile.criteria].sort((a, b) => a.order - b.order).map((criterion) => {
                const value = view.evaluation?.values[criterion.id] ?? null
                return (
                  <div key={criterion.id} className={!criterion.enabled ? 'disabled' : undefined}>
                    <span>{criterion.label}</span>
                    <span className="mini-track"><span style={{ width: value === null ? '0%' : `${Math.min(100, (value / criterion.scaleMax) * 100)}%` }} /></span>
                    <strong>{value === null ? '—' : value}</strong>
                  </div>
                )
              })}
            </section>
          </div>

          <ResearchFactsPanel facts={view.facts} userCompanyId={company.id} masterCompanyId={company.masterCompanyId} onSave={onSaveFact} />

          <section className="detail-section full-width">
            <div className="section-heading"><h3>選考予定・面接情報</h3><span>{company.events.length}件</span></div>
            <div className="event-list">
              {[...company.events].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()).map((event) => (
                <article className="event-row" key={event.id}>
                  <div className={`event-date ${deadlineTone(event.scheduledAt)}`}><strong>{new Date(event.scheduledAt).getDate()}</strong><span>{new Date(event.scheduledAt).toLocaleDateString('ja-JP', { month: 'short' })}</span></div>
                  <div className="event-copy"><div><span>{event.type}</span><em>{event.status}</em></div><h4>{event.title}</h4><p>{new Date(event.scheduledAt).toLocaleString('ja-JP')} {event.location && `· ${event.location}`}</p>{event.memo && <small>{event.memo}</small>}</div>
                  <div className="event-actions"><strong className={deadlineTone(event.scheduledAt)}>{formatDeadlineLabel(event.scheduledAt)}</strong><button type="button" onClick={() => startEdit(event)}>編集</button><button className="danger-link" type="button" onClick={() => deleteEvent(event.id)}>削除</button></div>
                </article>
              ))}
              {company.events.length === 0 && <p className="muted-message">選考予定はまだありません。</p>}
            </div>

            <form className="event-form" onSubmit={submitEvent}>
              <h4>{editingId ? '選考予定を編集' : '選考予定を追加'}</h4>
              {error && <div className="form-error" role="alert">{error}</div>}
              <div className="form-grid three-columns">
                <label className="field"><span>種別</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as SelectionEvent['type'] })}>{eventTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="field"><span>予定名 <em>必須</em></span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例: 一次面接" /></label>
                <label className="field"><span>日時 <em>必須</em></span><input type="datetime-local" value={draft.scheduledAt} onChange={(event) => setDraft({ ...draft, scheduledAt: event.target.value })} /></label>
                <label className="field"><span>状態</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as SelectionEvent['status'] })}>{eventStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="field"><span>場所・URL</span><input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="例: オンライン" /></label>
                <label className="field"><span>メモ</span><input value={draft.memo} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} placeholder="ダミー情報のみ" /></label>
              </div>
              <div className="inline-actions">{editingId && <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setDraft(blankEvent()); setError('') }}>編集をやめる</button>}<button className="primary-button small" type="submit">{editingId ? '予定を更新' : '予定を追加'}</button></div>
            </form>
          </section>

          {company.memo && <section className="detail-section full-width memo-box"><h3>個人メモ</h3><p>{company.memo}</p></section>}
        </div>
      </section>
    </div>
  )
}
