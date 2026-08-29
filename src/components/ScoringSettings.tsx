import { useEffect, useMemo, useState } from 'react'
import type { AppDataV2, Criterion, ScoringProfile } from '../domain/types'
import {
  addCriterionToProfile,
  createCustomProfile,
  duplicateProfile,
  moveCriterion,
  saveProfileDraft,
  setActiveProfile,
} from '../domain/profileManagement'
import { createId } from '../utils/id'

interface ScoringSettingsProps {
  data: AppDataV2
  onChange: (next: AppDataV2) => void
  hideDeveloperReference?: boolean
}

export function ScoringSettings({ data, onChange, hideDeveloperReference = false }: ScoringSettingsProps) {
  const filteredProfiles = hideDeveloperReference
    ? data.scoringProfiles.filter((profile) => profile.id !== 'profile_developer_reference_v2')
    : data.scoringProfiles
  const visibleProfiles = filteredProfiles.length > 0 ? filteredProfiles : data.scoringProfiles
  const active = visibleProfiles.find((profile) => profile.id === data.activeScoringProfileId)
    ?? visibleProfiles[0]
  const [draft, setDraft] = useState<ScoringProfile>(active)
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => setDraft(active), [active])

  const enabledWeight = useMemo(
    () => draft.criteria.filter((item) => item.enabled).reduce((sum, item) => sum + item.weight, 0),
    [draft.criteria],
  )

  const updateCriterion = (criterionId: string, patch: Partial<Criterion>) => {
    setDraft((current) => ({
      ...current,
      criteria: current.criteria.map((item) => item.id === criterionId ? { ...item, ...patch } : item),
    }))
  }

  const save = () => {
    const changedScale = draft.criteria.some((item) => {
      const previous = active.criteria.find((candidate) => candidate.id === item.id)
      return previous && previous.scaleMax !== item.scaleMax
    })
    if (changedScale && !window.confirm('最大点を変更すると、既存評価を同じ百分率になるよう比例変換します。続けますか？')) return
    try {
      onChange(saveProfileDraft(data, draft))
      setMessage('評価設定を保存し、ランキングを再計算しました。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '評価設定を保存できませんでした。')
    }
  }

  const createProfile = () => {
    if (!newName.trim()) {
      setMessage('新しいプロファイル名を入力してください。')
      return
    }
    onChange(createCustomProfile(data, `profile_${createId('profile')}`, newName))
    setNewName('')
    setMessage('空のカスタムプロファイルを作成しました。評価項目を追加してください。')
  }

  const duplicate = () => {
    const name = newName.trim() || `${active.name} のコピー`
    onChange(duplicateProfile(data, active.id, `profile_${createId('profile')}`, name))
    setNewName('')
    setMessage('評価項目と既存評価を保持して複製しました。')
  }

  const removeCriterion = (criterionId: string) => {
    const item = draft.criteria.find((candidate) => candidate.id === criterionId)
    if (!item || !window.confirm(`「${item.label}」を完全削除しますか？通常は無効化を推奨します。`)) return
    setDraft((current) => ({
      ...current,
      criteria: current.criteria.filter((candidate) => candidate.id !== criterionId),
    }))
  }

  return (
    <section className="page-stack" aria-labelledby="scoring-title">
      <div className="page-heading compact-heading">
        <div>
          <p className="eyebrow">SCORING PROFILE</p>
          <h1 id="scoring-title">評価設定</h1>
          <p>企業ランキングで何を重視するかを設定します。給与を重視する場合は給与の重要度を大きく、働きやすさを重視する場合はワークライフバランス等の重要度を大きくしてください。重要度の合計が100でなくても比率として自動計算されます。</p>
        </div>
      </div>

      {message && <div className="notice success" role="status">{message}</div>}

      <div className="settings-grid">
        <article className="panel settings-panel">
          <div className="panel-heading compact">
            <div><p className="eyebrow">PROFILES</p><h2>使用する評価体系</h2></div>
          </div>
          <div className="settings-body">
            <label className="field">
              <span>現在使用中の評価設定</span>
              <select
                aria-label="現在使用中の評価設定"
                value={active.id}
                onChange={(event) => onChange(setActiveProfile(data, event.target.value))}
              >
                {visibleProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>新規・複製先の名前</span>
              <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="例: エンジニア就活用" />
            </label>
            <div className="inline-actions start">
              <button className="secondary-button" type="button" onClick={createProfile}>空で作成</button>
              <button className="secondary-button" type="button" onClick={duplicate}>現在設定を複製</button>
            </div>
            <p className="settings-note">重要度の合計は100でなくても比率として正規化されます。</p>
          </div>
        </article>

        <article className="panel criteria-panel">
          <div className="panel-heading compact">
            <div><p className="eyebrow">CRITERIA</p><h2>評価項目</h2></div>
            <span className="panel-count">有効な重要度 {enabledWeight}</span>
          </div>
          <div className="settings-body">
            <label className="field">
              <span>プロファイル名</span>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>

            <div className="criteria-list">
              {[...draft.criteria].sort((a, b) => a.order - b.order).map((item, index) => (
                <article className={item.enabled ? 'criterion-card' : 'criterion-card disabled'} key={item.id}>
                  <div className="criterion-heading">
                    <label className="toggle-field">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(event) => updateCriterion(item.id, { enabled: event.target.checked })}
                      />
                      <span>{item.enabled ? '有効' : '無効'}</span>
                    </label>
                    <div className="order-actions">
                      <button type="button" disabled={index === 0} onClick={() => setDraft(moveCriterion(draft, item.id, -1))} aria-label={`${item.label}を上へ`}>↑</button>
                      <button type="button" disabled={index === draft.criteria.length - 1} onClick={() => setDraft(moveCriterion(draft, item.id, 1))} aria-label={`${item.label}を下へ`}>↓</button>
                    </div>
                  </div>
                  <div className="form-grid two-columns">
                    <label className="field"><span>項目名</span><input value={item.label} onChange={(event) => updateCriterion(item.id, { label: event.target.value })} /></label>
                    <label className="field"><span>説明</span><input value={item.description} onChange={(event) => updateCriterion(item.id, { description: event.target.value })} /></label>
                    <label className="field"><span>最大点</span><input type="number" min="0.1" step="0.1" value={item.scaleMax} onChange={(event) => updateCriterion(item.id, { scaleMax: Number(event.target.value) })} /></label>
                    <label className="field"><span>重要度</span><input type="number" min="0" step="0.5" value={item.weight} onChange={(event) => updateCriterion(item.id, { weight: Number(event.target.value) })} /></label>
                  </div>
                  <button className="danger-link" type="button" onClick={() => removeCriterion(item.id)}>完全削除</button>
                </article>
              ))}
            </div>

            <div className="inline-actions between">
              <button className="secondary-button" type="button" onClick={() => setDraft(addCriterionToProfile(draft, `criterion_${createId('criterion')}`))}>＋ 項目を追加</button>
              <button className="primary-button" type="button" onClick={save}>評価設定を保存</button>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}
