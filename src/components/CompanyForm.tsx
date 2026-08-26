import { useMemo, useState } from 'react'
import type {
  CatalogData,
  CompanyEvaluation,
  CompanyView,
  ScoringProfile,
  UserCompanyDraft,
} from '../domain/types'
import { myPageStatuses } from '../domain/types'
import { findMasterCandidates } from '../domain/companyMatching'
import { calculateScore } from '../domain/scoring'
import { selectionFromLabel, selectionLabel, selectionStatusOptions } from '../domain/selection'
import { addCriterionToProfile } from '../domain/profileManagement'
import { createId } from '../utils/id'

interface CompanyFormProps {
  companyView?: CompanyView
  catalog: CatalogData
  profile: ScoringProfile
  evaluation: CompanyEvaluation | null
  onSubmit: (draft: UserCompanyDraft, values: Record<string, number | null>) => void
  onSaveProfile: (profile: ScoringProfile) => void
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
      myPageStatus: view.company.myPageStatus,
      applicationUrl: view.company.applicationUrl,
      ...selectionFromLabel(selectionLabel(view.company)),
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
    myPageStatus: '未開設',
    applicationUrl: '',
    ...selectionFromLabel('検討中'),
    memo: '',
    watchEnabled: true,
  }
}

function initialValues(profile: ScoringProfile, evaluation: CompanyEvaluation | null) {
  return Object.fromEntries(profile.criteria.map((item) => [item.id, evaluation?.values[item.id] ?? null]))
}

export function CompanyForm({ companyView, catalog, profile, evaluation, onSubmit, onSaveProfile, onCancel }: CompanyFormProps) {
  const [draft, setDraft] = useState(() => initialDraft(companyView))
  const [values, setValues] = useState<Record<string, number | null>>(() => initialValues(profile, evaluation))
  const [error, setError] = useState('')
  const [editingCriteria, setEditingCriteria] = useState(false)
  const [profileDraft, setProfileDraft] = useState(profile)

  const candidates = useMemo(
    () => findMasterCandidates({ companyName: draft.userEnteredName, officialDomain: draft.applicationUrl }, catalog),
    [catalog, draft.applicationUrl, draft.userEnteredName],
  )
  const previewEvaluation: CompanyEvaluation = {
    id: 'preview',
    userCompanyId: companyView?.company.id ?? 'preview',
    scoringProfileId: profileDraft.id,
    values,
    createdAt: '',
    updatedAt: '',
  }
  const score = calculateScore(profileDraft, previewEvaluation)

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
    for (const item of profileDraft.criteria) {
      const value = values[item.id]
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > item.scaleMax)) {
        setError(`「${item.label}」は0から${item.scaleMax}までで入力してください。`)
        return
      }
    }
    const autoMatch = candidates.status === 'candidates' && candidates.candidates.length === 1
      ? candidates.candidates[0].master.id : draft.masterCompanyId
    onSubmit({
      ...draft,
      masterCompanyId: autoMatch,
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
            <p className="eyebrow">COMPANY</p>
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
                <span>企業名 <em>必須</em></span>
                <input autoFocus value={draft.userEnteredName} onChange={(event) => update('userEnteredName', event.target.value)} placeholder="例: 株式会社サンプルテック" />
              </label>
              {candidates.status === 'candidates' && candidates.candidates.length === 1 && (
                <div className="notice wide" role="note">
                  「{candidates.candidates[0].master.displayName}」が見つかりました。この企業として登録します。違う場合は企業名またはURLを修正してください。
                </div>
              )}
              {candidates.status === 'candidates' && candidates.candidates.length > 1 && <div className="notice wide" role="note">似た名前の企業が複数見つかりました。自動で同じ企業として扱わず、入力した企業名のまま登録します。</div>}
              <label className="field"><span>応募職種</span><input value={draft.role} onChange={(event) => update('role', event.target.value)} placeholder="例: Webエンジニア" /></label>
              <label className="field"><span>応募区分</span><input value={draft.applicationCategory} onChange={(event) => update('applicationCategory', event.target.value)} placeholder="例: 新卒・技術職" /></label>
              <label className="field"><span>現在の選考状況</span><select aria-label="現在の選考状況" value={selectionLabel(draft)} onChange={(event) => { const next = selectionFromLabel(event.target.value as typeof selectionStatusOptions[number]); setDraft((current) => ({ ...current, ...next })) }}>{selectionStatusOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
              {draft.selectionPhase === 'offer' && <label className="field"><span>内定後の状況</span><select value={draft.offerDecision ?? 'considering'} onChange={(event) => update('offerDecision', event.target.value as UserCompanyDraft['offerDecision'])}><option value="considering">検討中</option><option value="accepted">承諾</option><option value="declined">見送り</option></select></label>}
              <label className="field"><span>MyPage</span><select value={draft.myPageStatus} onChange={(event) => update('myPageStatus', event.target.value as UserCompanyDraft['myPageStatus'])}>{myPageStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="toggle-field wide"><input type="checkbox" checked={draft.watchEnabled} onChange={(event) => update('watchEnabled', event.target.checked)} /><span>この企業の更新情報を表示する</span></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>企業・採用ページURL</legend>
            <label className="field"><span>企業・採用ページURL</span><small>企業公式サイトや採用ページのURLを登録できます。後から企業情報を確認するときにも利用します。</small><input type="url" value={draft.applicationUrl} onChange={(event) => update('applicationUrl', event.target.value)} placeholder="https://example.com/..." /></label>
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
                {[...profileDraft.criteria].sort((a, b) => a.order - b.order).map((item) => (
                  <label key={item.id} className={!item.enabled ? 'disabled' : undefined}>
                      <span><strong>{item.label}</strong><small>最大 {item.scaleMax} / 重要度 {item.weight}{!item.enabled && ' / 無効'}</small></span>
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
            <legend>評価項目</legend>
            <button className="secondary-button" type="button" onClick={() => setEditingCriteria((current) => !current)}>評価項目を編集</button>
            {editingCriteria && <div className="criteria-list inline-criteria"><p className="settings-note">この企業の入力内容を保持したまま、現在の評価設定を編集できます。新しい項目は未評価として追加されます。</p>{profileDraft.criteria.map((item) => <article className="criterion-card" key={item.id}><div className="form-grid two-columns"><label className="field"><span>項目名</span><input value={item.label} onChange={(event) => setProfileDraft((current) => ({ ...current, criteria: current.criteria.map((candidate) => candidate.id === item.id ? { ...candidate, label: event.target.value } : candidate) }))} /></label><label className="field"><span>重要度</span><input type="number" min="0" step="1" value={item.weight} onChange={(event) => setProfileDraft((current) => ({ ...current, criteria: current.criteria.map((candidate) => candidate.id === item.id ? { ...candidate, weight: Number(event.target.value) } : candidate) }))} /></label><label className="field"><span>最大点</span><input type="number" min="1" step="1" value={item.scaleMax} onChange={(event) => setProfileDraft((current) => ({ ...current, criteria: current.criteria.map((candidate) => candidate.id === item.id ? { ...candidate, scaleMax: Number(event.target.value) } : candidate) }))} /></label><label className="toggle-field"><input type="checkbox" checked={item.enabled} onChange={(event) => setProfileDraft((current) => ({ ...current, criteria: current.criteria.map((candidate) => candidate.id === item.id ? { ...candidate, enabled: event.target.checked } : candidate) }))} /><span>{item.enabled ? '有効' : '無効'}</span></label></div></article>)}<div className="inline-actions"><button className="secondary-button" type="button" onClick={() => setProfileDraft((current) => addCriterionToProfile(current, `criterion_${createId('criterion')}`))}>項目を追加</button><button className="primary-button" type="button" onClick={() => { onSaveProfile(profileDraft); setValues((current) => Object.fromEntries(profileDraft.criteria.map((item) => [item.id, current[item.id] ?? null]))); setEditingCriteria(false) }}>評価項目を保存</button></div></div>}
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
