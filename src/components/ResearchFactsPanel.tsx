import { useState, type FormEvent } from 'react'
import {
  reviewStatuses,
  sourceTypes,
  verificationLevels,
  type ResearchFact,
  type ReviewStatus,
  type SourceType,
  type VerificationLevel,
} from '../domain/types'
import { isSafeHttpUrl } from '../domain/schemas'
import { createId } from '../utils/id'

interface ResearchFactsPanelProps {
  facts: ResearchFact[]
  userCompanyId: string
  masterCompanyId: string | null
  onSave: (fact: ResearchFact) => void
}

interface FactDraft {
  label: string
  key: string
  value: string
  recruitingCycle: string
  roleScope: string
  checkedAt: string
  verificationLevel: VerificationLevel
  reviewStatus: ReviewStatus
  processedByAi: boolean
  sourceType: SourceType
  sourceTitle: string
  sourceUrl: string
  sourceNote: string
}

const verificationLabels: Record<VerificationLevel, string> = {
  official_confirmed: '公式確認済み',
  official_interpreted: '公式情報を解釈',
  third_party_correlated: '第三者情報で照合',
  unverified: '未確認',
}

const reviewStatusLabels: Record<ReviewStatus, string> = {
  draft: '下書き',
  confirmed: '確認済み',
  stale: '要再確認',
  rejected: '却下',
}

const sourceTypeLabels: Record<SourceType, string> = {
  official_web: '公式Web',
  email: 'メール',
  third_party_web: '第三者Web',
  user: '本人入力',
  ai_summary: 'AI要約',
  legacy: 'v1移行',
}

const blankDraft = (): FactDraft => ({
  label: '',
  key: '',
  value: '',
  recruitingCycle: '',
  roleScope: '',
  checkedAt: '',
  verificationLevel: 'unverified',
  reviewStatus: 'draft',
  processedByAi: false,
  sourceType: 'user',
  sourceTitle: '',
  sourceUrl: '',
  sourceNote: '',
})

function formatDate(value: string | null): string {
  if (!value) return '未確認'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '日時不明'
  return date.toLocaleString('ja-JP')
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function ResearchFactsPanel({
  facts,
  userCompanyId,
  masterCompanyId,
  onSave,
}: ResearchFactsPanelProps) {
  const [draft, setDraft] = useState<FactDraft>(blankDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const resetForm = () => {
    setDraft(blankDraft())
    setEditingId(null)
    setError('')
  }

  const startEdit = (fact: ResearchFact) => {
    const source = fact.sources[0]
    setEditingId(fact.id)
    setDraft({
      label: fact.label,
      key: fact.key,
      value: fact.value,
      recruitingCycle: fact.recruitingCycle ?? '',
      roleScope: fact.roleScope ?? '',
      checkedAt: toDateTimeLocal(fact.checkedAt),
      verificationLevel: fact.verificationLevel,
      reviewStatus: fact.reviewStatus,
      processedByAi: fact.processedByAi,
      sourceType: source?.type ?? 'user',
      sourceTitle: source?.title ?? '',
      sourceUrl: source?.url ?? '',
      sourceNote: source?.note ?? '',
    })
    setError('')
    setMessage('')
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const label = draft.label.trim()
    const key = draft.key.trim()
    const sourceUrl = draft.sourceUrl.trim()

    if (!label || !key) {
      setError('項目名と管理キーを入力してください。')
      return
    }
    if (sourceUrl && !isSafeHttpUrl(sourceUrl)) {
      setError('出典URLはhttpまたはhttpsで始まるURLだけ保存できます。')
      return
    }

    let checkedAt: string | null = null
    if (draft.checkedAt) {
      const parsed = new Date(draft.checkedAt)
      if (Number.isNaN(parsed.getTime())) {
        setError('最終確認日の形式を確認してください。')
        return
      }
      checkedAt = parsed.toISOString()
    }

    const existing = editingId ? facts.find((fact) => fact.id === editingId) : undefined
    const existingSource = existing?.sources[0]
    const savedAt = new Date().toISOString()
    const firstSource = {
      id: existingSource?.id ?? createId('source'),
      type: draft.sourceType,
      title: draft.sourceTitle.trim(),
      url: sourceUrl || null,
      retrievedAt: existingSource ? existingSource.retrievedAt : savedAt,
      publishedAt: existingSource?.publishedAt ?? null,
      note: draft.sourceNote.trim(),
    }
    const fact: ResearchFact = {
      id: existing?.id ?? createId('fact'),
      userCompanyId: existing ? existing.userCompanyId : userCompanyId,
      masterCompanyId: existing ? existing.masterCompanyId : masterCompanyId,
      key,
      label,
      value: draft.value.trim(),
      recruitingCycle: draft.recruitingCycle.trim() || null,
      roleScope: draft.roleScope.trim() || null,
      checkedAt,
      verificationLevel: draft.verificationLevel,
      reviewStatus: draft.reviewStatus,
      processedByAi: draft.processedByAi,
      sources: [firstSource, ...(existing?.sources.slice(1) ?? [])],
      createdAt: existing?.createdAt ?? savedAt,
      updatedAt: savedAt,
    }

    onSave(fact)
    resetForm()
    setMessage(existing ? '調査情報を更新しました。' : '調査情報を追加しました。')
  }

  return (
    <section className="detail-section full-width" aria-labelledby="research-facts-title">
      <div className="section-heading">
        <h3 id="research-facts-title">調査情報・根拠</h3>
        <span>{facts.length}件</span>
      </div>

      <div className="demo-ribbon" role="note">
        <strong>注意</strong>
        <span>情報は最終確認時点のもので、変更される可能性があります。応募前に公式情報を確認してください。</span>
      </div>

      <div className="event-list">
        {facts.map((fact) => (
          <article className="event-form" key={fact.id} aria-label={`調査情報: ${fact.label}`}>
            <div className="section-heading">
              <h4>{fact.label}</h4>
              <button
                className="secondary-button"
                type="button"
                onClick={() => startEdit(fact)}
                aria-label={`${fact.label}を編集`}
              >
                編集
              </button>
            </div>
            <dl className="fact-list">
              <div><dt>値</dt><dd>{fact.value || '未登録'}</dd></div>
              <div><dt>確認レベル</dt><dd>{verificationLabels[fact.verificationLevel]}</dd></div>
              <div><dt>確認状態</dt><dd>{reviewStatusLabels[fact.reviewStatus]}</dd></div>
              <div><dt>対象年度</dt><dd>{fact.recruitingCycle || '未設定'}</dd></div>
              <div><dt>対象職種</dt><dd>{fact.roleScope || '未設定'}</dd></div>
              <div><dt>最終確認日</dt><dd>{formatDate(fact.checkedAt)}</dd></div>
              <div><dt>AI整理</dt><dd>{fact.processedByAi ? 'あり' : 'なし'}</dd></div>
              <div><dt>管理キー</dt><dd>{fact.key}</dd></div>
            </dl>

            <details>
              <summary>根拠を見る</summary>
              {fact.sources.length === 0 && <p className="muted-message">出典は登録されていません。</p>}
              {fact.sources.map((source, index) => (
                <section key={source.id} aria-label={`出典 ${index + 1}`}>
                  <h5>出典 {index + 1}</h5>
                  <dl className="fact-list">
                    <div><dt>種別</dt><dd>{sourceTypeLabels[source.type]}</dd></div>
                    <div><dt>タイトル</dt><dd>{source.title || '未設定'}</dd></div>
                    <div>
                      <dt>URL</dt>
                      <dd>
                        {source.url && isSafeHttpUrl(source.url)
                          ? <a className="external-link" href={source.url} target="_blank" rel="noreferrer">出典を開く ↗</a>
                          : source.url ? '安全でないURLのため非表示' : '未設定'}
                      </dd>
                    </div>
                    <div><dt>取得日</dt><dd>{formatDate(source.retrievedAt)}</dd></div>
                    <div><dt>公開日</dt><dd>{formatDate(source.publishedAt)}</dd></div>
                    <div><dt>メモ</dt><dd>{source.note || 'なし'}</dd></div>
                  </dl>
                </section>
              ))}
            </details>
          </article>
        ))}
        {facts.length === 0 && <p className="muted-message">調査情報はまだありません。</p>}
      </div>

      <form className="event-form" onSubmit={submit} noValidate>
        <h4>{editingId ? '調査情報を編集' : '調査情報を追加'}</h4>
        {error && <div className="form-error" role="alert">{error}</div>}
        {message && <div className="notice success" role="status">{message}</div>}

        <fieldset>
          <legend>情報</legend>
          <div className="form-grid two-columns">
            <label className="field">
              <span>項目名 <em>必須</em></span>
              <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
            </label>
            <label className="field">
              <span>管理キー <em>必須</em></span>
              <input value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} />
            </label>
            <label className="field wide">
              <span>値</span>
              <textarea rows={3} value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} />
            </label>
            <label className="field">
              <span>対象年度</span>
              <input value={draft.recruitingCycle} onChange={(event) => setDraft({ ...draft, recruitingCycle: event.target.value })} />
            </label>
            <label className="field">
              <span>対象職種</span>
              <input value={draft.roleScope} onChange={(event) => setDraft({ ...draft, roleScope: event.target.value })} />
            </label>
            <label className="field">
              <span>最終確認日</span>
              <input type="datetime-local" value={draft.checkedAt} onChange={(event) => setDraft({ ...draft, checkedAt: event.target.value })} />
            </label>
            <label className="field">
              <span>確認レベル</span>
              <select value={draft.verificationLevel} onChange={(event) => setDraft({ ...draft, verificationLevel: event.target.value as VerificationLevel })}>
                {verificationLevels.map((level) => <option key={level} value={level}>{verificationLabels[level]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>確認状態</span>
              <select value={draft.reviewStatus} onChange={(event) => setDraft({ ...draft, reviewStatus: event.target.value as ReviewStatus })}>
                {reviewStatuses.map((status) => <option key={status} value={status}>{reviewStatusLabels[status]}</option>)}
              </select>
            </label>
            <label className="toggle-field">
              <input type="checkbox" checked={draft.processedByAi} onChange={(event) => setDraft({ ...draft, processedByAi: event.target.checked })} />
              <span>AIが整理した情報</span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>出典</legend>
          <div className="form-grid two-columns">
            <label className="field">
              <span>出典種別</span>
              <select value={draft.sourceType} onChange={(event) => setDraft({ ...draft, sourceType: event.target.value as SourceType })}>
                {sourceTypes.map((type) => <option key={type} value={type}>{sourceTypeLabels[type]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>出典タイトル</span>
              <input value={draft.sourceTitle} onChange={(event) => setDraft({ ...draft, sourceTitle: event.target.value })} />
            </label>
            <label className="field wide">
              <span>出典URL（http/httpsのみ）</span>
              <input type="url" inputMode="url" value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} />
            </label>
            <label className="field wide">
              <span>出典メモ</span>
              <textarea rows={2} value={draft.sourceNote} onChange={(event) => setDraft({ ...draft, sourceNote: event.target.value })} />
            </label>
          </div>
        </fieldset>

        <div className="inline-actions">
          {editingId && <button className="secondary-button" type="button" onClick={resetForm}>編集をやめる</button>}
          <button className="primary-button small" type="submit">{editingId ? '変更を保存' : '情報を追加'}</button>
        </div>
      </form>
    </section>
  )
}
