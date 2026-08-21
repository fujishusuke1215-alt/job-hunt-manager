import { useRef, useState } from 'react'
import type { AppDataV2, CatalogData } from '../domain/types'
import type { AiSyncPreview } from '../domain/aiSync'
import { commitAiSyncPreview, previewAiSync } from '../domain/aiSync'

interface AiSyncProps {
  data: AppDataV2
  catalog: CatalogData
  onChange: (data: AppDataV2) => void
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return 'なし'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

export function AiSync({ data, catalog, onChange }: AiSyncProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [json, setJson] = useState('')
  const [preview, setPreview] = useState<AiSyncPreview | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const buildPreview = (input = json) => {
    try {
      const next = previewAiSync(input, data, catalog)
      setPreview(next)
      setSelected(new Set(next.items.filter((item) => item.canApply && !item.requiresDeleteConfirmation).map((item) => item.operation.operationId)))
      setIsError(false)
      setMessage(`反映可能 ${next.readyCount}件 / 停止 ${next.blockedCount}件 / 重複 ${next.duplicateCount}件。まだ本データは変更していません。`)
    } catch (error) {
      setPreview(null)
      setSelected(new Set())
      setIsError(true)
      setMessage(error instanceof Error ? error.message : 'AI Sync JSONを検証できませんでした。')
    }
  }

  const readFile = async (file: File) => {
    const text = await file.text()
    setJson(text)
    buildPreview(text)
    if (fileRef.current) fileRef.current.value = ''
  }

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const commit = () => {
    if (!preview || selected.size === 0) {
      setIsError(true)
      setMessage('反映する候補を1件以上選択してください。')
      return
    }
    const deleteIds = preview.items.filter((item) => selected.has(item.operation.operationId) && item.requiresDeleteConfirmation).map((item) => item.operation.operationId)
    if (deleteIds.length > 0 && !window.confirm(`${deleteIds.length}件の削除操作を含みます。選択した削除を実行しますか？`)) return
    try {
      const result = commitAiSyncPreview(data, preview, selected, { confirmedDeleteOperationIds: deleteIds })
      onChange(result.data)
      setPreview(null)
      setSelected(new Set())
      setIsError(false)
      setMessage(`${result.appliedOperationIds.length}件を反映しました。${result.skippedOperationIds.length}件はスキップしました。`)
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error ? error.message : '反映を完了できませんでした。')
    }
  }

  return (
    <section className="page-stack" aria-labelledby="ai-sync-title">
      <div className="page-heading compact-heading"><div><p className="eyebrow">MANUAL AI IMPORT</p><h1 id="ai-sync-title">AI同期</h1><p>ChatGPT等のJSONを検証し、差分を選んでから反映します。API課金や会話の自動取得はありません。</p></div></div>
      <div className="notice" role="note">AIは一次情報ではありません。公式ページをAIが整理した場合も、出典は official_web、processedByAi は別に記録します。</div>
      {message && <div className={isError ? 'notice error' : 'notice success'} role="status">{message}</div>}

      <article className="panel ai-input-panel">
        <div className="panel-heading compact"><div><p className="eyebrow">INPUT</p><h2>AI Sync JSON</h2></div></div>
        <div className="settings-body">
          <label className="field"><span>JSONを貼り付け</span><textarea rows={12} value={json} onChange={(event) => setJson(event.target.value)} placeholder="AI_SYNC_FORMAT.mdのAiSyncEnvelopeV1を貼り付け" /></label>
          <input ref={fileRef} className="sr-only" id="ai-sync-file" type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void readFile(event.target.files[0])} />
          <div className="inline-actions start"><label className="secondary-button label-button" htmlFor="ai-sync-file">JSONファイルを選ぶ</label><button className="primary-button" type="button" onClick={() => buildPreview()}>検証して差分を見る</button></div>
        </div>
      </article>

      {preview && (
        <article className="panel ai-preview-panel">
          <div className="panel-heading"><div><p className="eyebrow">DIFF PREVIEW</p><h2>{preview.envelope.provider} からの候補</h2></div><span className="panel-count">{preview.items.length}件</span></div>
          <div className="preview-toolbar"><button className="text-button" type="button" onClick={() => setSelected(new Set(preview.items.filter((item) => item.canApply).map((item) => item.operation.operationId)))}>反映可能を全選択</button><button className="text-button" type="button" onClick={() => setSelected(new Set())}>全解除</button></div>
          <div className="diff-list">
            {preview.items.map((item) => (
              <article className={`diff-card ${item.status}`} key={`${item.operation.operationId}-${item.targetLabel}`}>
                <div className="diff-heading">
                  <label className="toggle-field"><input type="checkbox" disabled={!item.canApply} checked={selected.has(item.operation.operationId)} onChange={() => toggle(item.operation.operationId)} /><span>{item.operation.entityType} / {item.operation.action}</span></label>
                  <span className={`status-chip ${item.status}`}>{item.status}</span>
                </div>
                <h3>{item.targetLabel}</h3>
                <p>{item.message}</p>
                <p className="settings-note">照合: {item.companyMatch.message}</p>
                {item.requiresDeleteConfirmation && <div className="notice error">削除操作です。反映時に追加確認します。</div>}
                <div className="change-list">
                  {item.changes.length === 0 ? <p>表示できる差分はありません。</p> : item.changes.map((change) => (
                    <div className="change-row" key={change.field}><strong>{change.label}</strong><pre>{valueText(change.before)}</pre><span aria-hidden="true">→</span><pre>{valueText(change.after)}</pre></div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <div className="inline-actions"><button className="secondary-button" type="button" onClick={() => { setPreview(null); setSelected(new Set()); setMessage('差分確認をキャンセルしました。') }}>キャンセル</button><button className="primary-button" type="button" onClick={commit}>選択した {selected.size}件を反映</button></div>
        </article>
      )}

      <article className="panel history-panel">
        <div className="panel-heading compact"><div><p className="eyebrow">HISTORY</p><h2>取り込み履歴</h2></div></div>
        {data.aiImportHistory.length === 0 ? <p className="muted-message">AI Syncの反映履歴はありません。</p> : <ul className="simple-list">{[...data.aiImportHistory].reverse().map((item) => <li key={item.id}><strong>{item.provider}</strong><span>{new Date(item.importedAt).toLocaleString('ja-JP')}</span><small>反映 {item.appliedOperationIds.length} / スキップ {item.skippedOperationIds.length}</small></li>)}</ul>}
      </article>
    </section>
  )
}
