import { useMemo, useState } from 'react'
import type {
  CatalogData,
  CompanyEvaluation,
  CompanyView,
  ScoringProfile,
  UserCompanyDraft,
} from '../domain/types'
import { applicationStatuses, myPageStatuses, priorities } from '../domain/types'
import { findMasterCandidates, resolveCanonicalMaster } from '../domain/companyMatching'
import { calculateScore } from '../domain/scoring'

interface CompanyFormProps {
  companyView?: CompanyView
  catalog: CatalogData
  profile: ScoringProfile
  evaluation: CompanyEvaluation | null
  onSubmit: (draft: UserCompanyDraft, values: Record<string, number | null>) => void
  onCancel: () => void
}

function initialDraft(view?: CompanyView): UserCompanyDraft {
  if (view) {
    return {
      masterCompanyId: view.company.masterCompanyId,
      userEnteredName: view.company.userEnteredName,
      role: view.company.role,
      applicationCategory: view.company.applicationCategory,
      manualPriority: view.company.manualPriority,
      interest: view.company.interest,
      applicationStatus: view.company.applicationStatus,
      myPageStatus: view.company.myPageStatus,
      applicationUrl: view.company.applicationUrl,
      memo: view.company.memo,
      watchEnabled: view.company.watchEnabled,
    }
  }
  return {
    masterCompanyId: null,
    userEnteredName: '',
    role: '',
    applicationCategory: '',
    manualPriority: 'B',
    interest: 3,
    applicationStatus: '検討中',
    myPageStatus: '未開設',
    applicationUrl: '',
    memo: '',
    watchEnabled: true,
  }
}

function initialValues(profile: ScoringProfile, evaluation: CompanyEvaluation | null) {
  return Object.fromEntries(profile.criteria.map((item) => [item.id, evaluation?.values[item.id] ?? null]))
}

export function CompanyForm({ companyView, catalog, profile, evaluation, onSubmit, onCancel }: CompanyFormProps) {
  const [draft, setDraft] = useState(() => initialDraft(companyView))
  const [values, setValues] = useState<Record<string, number | null>>(() => initialValues(profile, evaluation))
  const [error, setError] = useState('')

  const candidates = useMemo(
    () => findMasterCandidates({ companyName: draft.userEnteredName }, catalog),
    [catalog, draft.userEnteredName],
  )
  const linkedMaster = draft.masterCompanyId ? resolveCanonicalMaster(draft.masterCompanyId, catalog) : null
  const previewEvaluation: CompanyEvaluation = {
    id: 'preview',
    userCompanyId: companyView?.company.id ?? 'preview',
    scoringProfileId: profile.id,
    values,
    createdAt: '',
    updatedAt: '',
  }
  const score = calculateScore(profile, previewEvaluation)

  const update = <K extends keyof UserCompanyDraft>(key: K, value: UserCompanyDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.userEnteredName.trim()) {
      setError('企業名を入力してください。')
      return
    }
    if (draft.applicationUrl && !/^https?:\/\//i.test(draft.applicationUrl)) {
      setError('応募URLは http:// または https:// から入力してください。')
      return
    }
    onSubmit({
      ...draft,
      userEnteredName: draft.userEnteredName.trim(),
      role: draft.role.trim(),
      applicationCategory: draft.applicationCategory.trim(),
      applicationUrl: draft.applicationUrl.trim(),
      memo: draft.memo.trim(),
    }, values)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="modal form-modal" role="dialog" aria-modal="true" aria-labelledby="company-form-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">USER COMPANY</p>
            <h2 id="company-form-title">{companyView ? '企業情報を編集' : '新しい企業を登録'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="閉じる">×</button>
        </div>

        <form onSubmit={submit}>
          {error && <div className="form-error" role="alert">{error}</div>}
          <fieldset>
            <legend>基本情報</legend>
            <div className="form-grid two-columns">
              <label className="field wide">
                <span>自分が入力した企業名 <em>必須</em></span>
                <input autoFocus value={draft.userEnteredName} onChange={(event) => update('userEnteredName', event.target.value)} placeholder="例: 株式会社サンプルテック" />
              </label>
              <label className="field wide">
                <span>企業マスタとの紐付け</span>
                <select
                  aria-label="企業マスタとの紐付け"
                  value={draft.masterCompanyId ?? ''}
                  onChange={(event) => update('masterCompanyId', event.target.value || null)}
                >
                  <option value="">独自企業として保存（未紐付け）</option>
                  {catalog.masterCompanies.filter((item) => item.status === 'active').map((item) => (
                    <option key={item.id} value={item.id}>{item.displayName}</option>
                  ))}
                </select>
              </label>
              {candidates.status === 'candidates' && !linkedMaster && (
                <div className="notice wide" role="note">
                  同一候補: {candidates.candidates.map((item) => item.master.displayName).join('、')}。自動統合せず、上の選択で確認します。
                </div>
              )}
              {linkedMaster && <p className="settings-note wide">恒久ID: {linkedMaster.id} / 表示名: {linkedMaster.displayName}</p>}
              <label className="field"><span>応募職種</span><input value={draft.role} onChange={(event) => update('role', event.target.value)} placeholder="例: Webエンジニア" /></label>
              <label className="field"><span>応募区分</span><input value={draft.applicationCategory} onChange={(event) => update('applicationCategory', event.target.value)} placeholder="例: 新卒・技術職" /></label>
              <label className="field"><span>手動優先度</span><select value={draft.manualPriority} onChange={(event) => update('manualPriority', event.target.value as UserCompanyDraft['manualPriority'])}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="field"><span>選考状況</span><select value={draft.applicationStatus} onChange={(event) => update('applicationStatus', event.target.value as UserCompanyDraft['applicationStatus'])}>{applicationStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="field"><span>志望度: {draft.interest}/5</span><input type="range" min="0" max="5" step="1" value={draft.interest} onChange={(event) => update('interest', Number(event.target.value))} /></label>
              <label className="field"><span>MyPage</span><select value={draft.myPageStatus} onChange={(event) => update('myPageStatus', event.target.value as UserCompanyDraft['myPageStatus'])}>{myPageStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="toggle-field wide"><input type="checkbox" checked={draft.watchEnabled} onChange={(event) => update('watchEnabled', event.target.checked)} /><span>この企業のWatch結果を受け取る</span></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>応募導線</legend>
            <label className="field"><span>応募URL</span><input type="url" value={draft.applicationUrl} onChange={(event) => update('applicationUrl', event.target.value)} placeholder="https://example.com/..." /></label>
          </fieldset>

          <fieldset>
            <legend>企業評価 <small>空欄は0点ではなく未評価</small></legend>
            <div className="score-editor">
              <div className="score-preview">
                <span>{score.provisional ? '暫定スコア' : '総合点'}</span>
                <strong>{score.score === null ? '—' : score.score.toFixed(1)}</strong>
                <small>充足率 {score.coverage}%</small>
              </div>
              <div className="score-fields dynamic-scores">
                {[...profile.criteria].sort((a, b) => a.order - b.order).map((item) => (
                  <label key={item.id} className={!item.enabled ? 'disabled' : undefined}>
                    <span><strong>{item.label}</strong><small>最大 {item.scaleMax} / weight {item.weight}{!item.enabled && ' / 無効'}</small></span>
                    <input
                      aria-label={`${item.label}評価`}
                      type="number"
                      min="0"
                      max={item.scaleMax}
                      step="0.1"
                      disabled={!item.enabled}
                      value={values[item.id] ?? ''}
                      onChange={(event) => setValues({ ...values, [item.id]: event.target.value === '' ? null : Number(event.target.value) })}
                    />
                    <em>{values[item.id] ?? '—'}</em>
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>個人メモ</legend>
            <label className="field"><span className="sr-only">企業メモ</span><textarea rows={4} value={draft.memo} onChange={(event) => update('memo', event.target.value)} placeholder="公開デモやスクリーンショットにはダミー情報だけを使ってください。" /></label>
          </fieldset>

          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onCancel}>キャンセル</button>
            <button className="primary-button" type="submit">{companyView ? '変更を保存' : '企業を登録'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
