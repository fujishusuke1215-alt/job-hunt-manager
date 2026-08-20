import { useState } from 'react'
import type { Company, SelectionEvent } from '../types'
import { eventStatuses, eventTypes } from '../types'
import { deadlineTone, formatDeadlineLabel } from '../utils/deadlines'
import { calculateOverallScore } from '../utils/scoring'
import { createId } from '../utils/id'

interface CompanyDetailProps {
  company: Company
  onClose: () => void
  onEdit: () => void
  onUpdateEvents: (events: SelectionEvent[]) => void
}

const blankEvent = (): Omit<SelectionEvent, 'id'> => ({
  type: '面接',
  title: '',
  scheduledAt: '',
  status: '予定',
  location: '',
  memo: '',
})

export function CompanyDetail({ company, onClose, onEdit, onUpdateEvents }: CompanyDetailProps) {
  const [draft, setDraft] = useState(blankEvent)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const score = calculateOverallScore(company.scores, company.interest)

  const submitEvent = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.title.trim() || !draft.scheduledAt) {
      setError('予定名と日時を入力してください。')
      return
    }
    if (editingId) {
      onUpdateEvents(company.events.map((item) => item.id === editingId ? { ...draft, id: editingId } : item))
    } else {
      onUpdateEvents([...company.events, { ...draft, id: createId('event') }])
    }
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
    if (window.confirm('この選考予定を削除しますか？')) {
      onUpdateEvents(company.events.filter((event) => event.id !== id))
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="company-detail-title">
        <div className="detail-hero">
          <div>
            <div className="chip-row">
              <span className={`priority priority-${company.priority.toLowerCase()}`}>優先度 {company.priority}</span>
              <span className="status-chip">{company.status}</span>
            </div>
            <h2 id="company-detail-title">{company.name}</h2>
            <p>{company.role || '職種未設定'} · {company.applicationCategory || '応募区分未設定'}</p>
          </div>
          <div className="detail-score"><span>総合点</span><strong>{score.toFixed(1)}</strong><small>/100</small></div>
          <button className="icon-button light" type="button" onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <div className="detail-body">
          <div className="detail-toolbar">
            <div className="interest-stars" aria-label={`志望度 ${company.interest} / 5`}>
              <span>志望度</span><strong>{'★'.repeat(company.interest)}{'☆'.repeat(5 - company.interest)}</strong>
            </div>
            <button className="secondary-button" type="button" onClick={onEdit}>企業情報を編集</button>
          </div>

          <div className="detail-grid">
            <section className="detail-section">
              <h3>応募条件・テスト</h3>
              <dl className="fact-list">
                <div><dt>新卒</dt><dd>{company.graduateEligibility}</dd></div>
                <div><dt>既卒</dt><dd>{company.existingGraduateEligibility}</dd></div>
                <div><dt>職歴あり</dt><dd>{company.workExperienceEligibility}</dd></div>
                <div><dt>Webテスト</dt><dd>{company.webTest || '未登録'}</dd></div>
                <div><dt>コードテスト</dt><dd>{company.codingTest || '未登録'}</dd></div>
                <div><dt>MyPage</dt><dd>{company.myPageStatus}</dd></div>
              </dl>
              {company.applicationUrl && (
                <a className="external-link" href={company.applicationUrl} target="_blank" rel="noreferrer">応募ページを開く ↗</a>
              )}
            </section>

            <section className="detail-section score-breakdown">
              <h3>評価内訳</h3>
              {([
                ['給与', company.scores.salary], ['福利厚生', company.scores.benefits], ['WLB', company.scores.wlb],
                ['リモート', company.scores.remote], ['フレックス', company.scores.flex], ['海外可能性', company.scores.overseas], ['IT/DX一致', company.scores.itFit],
              ] as const).map(([label, value]) => (
                <div key={label}><span>{label}</span><span className="mini-track"><span style={{ width: `${value * 20}%` }} /></span><strong>{value}</strong></div>
              ))}
            </section>
          </div>

          <section className="detail-section full-width">
            <div className="section-heading"><h3>選考予定・面接情報</h3><span>{company.events.length}件</span></div>
            <div className="event-list">
              {[...company.events].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()).map((event) => (
                <article className="event-row" key={event.id}>
                  <div className={`event-date ${deadlineTone(event.scheduledAt)}`}>
                    <strong>{new Date(event.scheduledAt).getDate()}</strong>
                    <span>{new Date(event.scheduledAt).toLocaleDateString('ja-JP', { month: 'short' })}</span>
                  </div>
                  <div className="event-copy">
                    <div><span>{event.type}</span><em>{event.status}</em></div>
                    <h4>{event.title}</h4>
                    <p>{new Date(event.scheduledAt).toLocaleString('ja-JP')} {event.location && `· ${event.location}`}</p>
                    {event.memo && <small>{event.memo}</small>}
                  </div>
                  <div className="event-actions">
                    <strong className={deadlineTone(event.scheduledAt)}>{formatDeadlineLabel(event.scheduledAt)}</strong>
                    <button type="button" onClick={() => startEdit(event)}>編集</button>
                    <button className="danger-link" type="button" onClick={() => deleteEvent(event.id)}>削除</button>
                  </div>
                </article>
              ))}
              {company.events.length === 0 && <p className="muted-message">選考予定はまだありません。</p>}
            </div>

            <form className="event-form" onSubmit={submitEvent}>
              <h4>{editingId ? '選考予定を編集' : '選考予定を追加'}</h4>
              {error && <div className="form-error" role="alert">{error}</div>}
              <div className="form-grid three-columns">
                <label className="field"><span>種別</span><select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as SelectionEvent['type'] })}>{eventTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                <label className="field"><span>予定名 <em>必須</em></span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例: 一次面接" /></label>
                <label className="field"><span>日時 <em>必須</em></span><input type="datetime-local" value={draft.scheduledAt} onChange={(e) => setDraft({ ...draft, scheduledAt: e.target.value })} /></label>
                <label className="field"><span>状態</span><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as SelectionEvent['status'] })}>{eventStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                <label className="field"><span>場所・URL</span><input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="例: オンライン" /></label>
                <label className="field"><span>メモ</span><input value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} placeholder="ダミー情報のみ" /></label>
              </div>
              <div className="inline-actions">
                {editingId && <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setDraft(blankEvent()); setError('') }}>編集をやめる</button>}
                <button className="primary-button small" type="submit">{editingId ? '予定を更新' : '予定を追加'}</button>
              </div>
            </form>
          </section>

          {company.memo && <section className="detail-section full-width memo-box"><h3>企業メモ</h3><p>{company.memo}</p></section>}
        </div>
      </section>
    </div>
  )
}
