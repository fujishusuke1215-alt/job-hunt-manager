import { useMemo, useState } from 'react'
import type { Company, CompanyDraft, Eligibility, EvaluationScores } from '../types'
import { applicationStatuses, eligibilityOptions, priorities } from '../types'
import { calculateOverallScore } from '../utils/scoring'

interface CompanyFormProps {
  company?: Company
  onSubmit: (draft: CompanyDraft) => void
  onCancel: () => void
}

const blankScores: EvaluationScores = {
  salary: 3,
  benefits: 3,
  wlb: 3,
  remote: 3,
  flex: 3,
  overseas: 3,
  itFit: 3,
}

function initialDraft(company?: Company): CompanyDraft {
  if (company) {
    return {
      name: company.name,
      role: company.role,
      applicationCategory: company.applicationCategory,
      priority: company.priority,
      interest: company.interest,
      status: company.status,
      graduateEligibility: company.graduateEligibility,
      existingGraduateEligibility: company.existingGraduateEligibility,
      workExperienceEligibility: company.workExperienceEligibility,
      webTest: company.webTest,
      codingTest: company.codingTest,
      myPageStatus: company.myPageStatus,
      applicationUrl: company.applicationUrl,
      memo: company.memo,
      scores: { ...company.scores },
    }
  }
  return {
    name: '',
    role: '',
    applicationCategory: '',
    priority: 'B',
    interest: 3,
    status: '検討中',
    graduateEligibility: '要確認',
    existingGraduateEligibility: '要確認',
    workExperienceEligibility: '要確認',
    webTest: '',
    codingTest: '',
    myPageStatus: '未開設',
    applicationUrl: '',
    memo: '',
    scores: blankScores,
  }
}

const scoreFields: { key: keyof EvaluationScores; label: string; help: string }[] = [
  { key: 'salary', label: '給与', help: '想定年収や昇給' },
  { key: 'benefits', label: '福利厚生', help: '休暇・手当・制度' },
  { key: 'wlb', label: 'WLB', help: '働きやすさ' },
  { key: 'remote', label: 'リモート', help: '場所の柔軟性' },
  { key: 'flex', label: 'フレックス', help: '時間の柔軟性' },
  { key: 'overseas', label: '海外可能性', help: '海外案件・異動' },
  { key: 'itFit', label: 'IT/DX一致', help: '希望職種との一致' },
]

export function CompanyForm({ company, onSubmit, onCancel }: CompanyFormProps) {
  const [draft, setDraft] = useState(() => initialDraft(company))
  const [error, setError] = useState('')
  const score = useMemo(() => calculateOverallScore(draft.scores, draft.interest), [draft.scores, draft.interest])

  const update = <K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const updateEligibility = (key: 'graduateEligibility' | 'existingGraduateEligibility' | 'workExperienceEligibility', value: Eligibility) => {
    update(key, value)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('企業名を入力してください。')
      return
    }
    if (draft.applicationUrl && !/^https?:\/\//i.test(draft.applicationUrl)) {
      setError('応募URLは http:// または https:// から入力してください。')
      return
    }
    onSubmit({ ...draft, name: draft.name.trim(), role: draft.role.trim() })
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="modal form-modal" role="dialog" aria-modal="true" aria-labelledby="company-form-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">COMPANY PROFILE</p>
            <h2 id="company-form-title">{company ? '企業情報を編集' : '新しい企業を登録'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="閉じる">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="form-error" role="alert">{error}</div>}
          <fieldset>
            <legend>基本情報</legend>
            <div className="form-grid two-columns">
              <label className="field wide">
                <span>企業名 <em>必須</em></span>
                <input autoFocus value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="例: 株式会社サンプルA" />
              </label>
              <label className="field">
                <span>応募職種</span>
                <input value={draft.role} onChange={(event) => update('role', event.target.value)} placeholder="例: Webエンジニア" />
              </label>
              <label className="field">
                <span>応募区分</span>
                <input value={draft.applicationCategory} onChange={(event) => update('applicationCategory', event.target.value)} placeholder="例: 新卒・技術職" />
              </label>
              <label className="field">
                <span>優先度</span>
                <select value={draft.priority} onChange={(event) => update('priority', event.target.value as CompanyDraft['priority'])}>
                  {priorities.map((priority) => <option key={priority}>{priority}</option>)}
                </select>
              </label>
              <label className="field">
                <span>選考状況</span>
                <select value={draft.status} onChange={(event) => update('status', event.target.value as CompanyDraft['status'])}>
                  {applicationStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label className="field">
                <span>志望度: {draft.interest}/5</span>
                <input type="range" min="0" max="5" step="1" value={draft.interest} onChange={(event) => update('interest', Number(event.target.value))} />
              </label>
              <label className="field">
                <span>MyPage</span>
                <select value={draft.myPageStatus} onChange={(event) => update('myPageStatus', event.target.value as CompanyDraft['myPageStatus'])}>
                  <option>未開設</option><option>開設済み</option><option>不要</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>応募資格</legend>
            <div className="form-grid three-columns">
              {([
                ['graduateEligibility', '新卒応募'],
                ['existingGraduateEligibility', '既卒応募'],
                ['workExperienceEligibility', '職歴あり応募'],
              ] as const).map(([key, label]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <select value={draft[key]} onChange={(event) => updateEligibility(key, event.target.value as Eligibility)}>
                    {eligibilityOptions.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>テスト・応募導線</legend>
            <div className="form-grid two-columns">
              <label className="field"><span>Webテスト</span><input value={draft.webTest} onChange={(event) => update('webTest', event.target.value)} placeholder="例: 要確認" /></label>
              <label className="field"><span>コーディングテスト</span><input value={draft.codingTest} onChange={(event) => update('codingTest', event.target.value)} placeholder="例: 実装課題" /></label>
              <label className="field wide"><span>応募URL</span><input type="url" value={draft.applicationUrl} onChange={(event) => update('applicationUrl', event.target.value)} placeholder="https://example.com/..." /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>企業評価 <small>0: 未評価 / 5: とても合う</small></legend>
            <div className="score-editor">
              <div className="score-preview"><span>自動計算</span><strong>{score.toFixed(1)}</strong><small>/ 100</small></div>
              <div className="score-fields">
                {scoreFields.map((item) => (
                  <label key={item.key}>
                    <span><strong>{item.label}</strong><small>{item.help}</small></span>
                    <input
                      aria-label={`${item.label}評価`}
                      type="range"
                      min="0"
                      max="5"
                      step="1"
                      value={draft.scores[item.key]}
                      onChange={(event) => update('scores', { ...draft.scores, [item.key]: Number(event.target.value) })}
                    />
                    <em>{draft.scores[item.key]}</em>
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>メモ</legend>
            <label className="field"><span className="sr-only">企業メモ</span><textarea rows={4} value={draft.memo} onChange={(event) => update('memo', event.target.value)} placeholder="公開リポジトリには実際の応募・面接情報を入力しないでください。" /></label>
          </fieldset>

          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onCancel}>キャンセル</button>
            <button className="primary-button" type="submit">{company ? '変更を保存' : '企業を登録'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
