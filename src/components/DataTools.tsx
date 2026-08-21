import { useRef, useState } from 'react'
import type { AppDataV2, AppMode, SyncStatus } from '../domain/types'
import type { BackupImportPreview } from '../domain/backup'
import { createAiAnalysisExport, createV2Backup, previewBackupImport } from '../domain/backup'

interface DataToolsProps {
  mode: AppMode
  data: AppDataV2
  storageLabel: string
  syncStatus: SyncStatus
  onImport: (data: AppDataV2) => void
  onClear: () => void
  onResetDemo: () => void
}

function downloadJson(contents: string, filename: string) {
  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function DataTools({ mode, data, storageLabel, syncStatus, onImport, onClear, onResetDemo }: DataToolsProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [preview, setPreview] = useState<BackupImportPreview | null>(null)
  const [includeNotes, setIncludeNotes] = useState(false)

  const exportData = () => {
    downloadJson(createV2Backup(data), `job-hunt-manager-backup-v2-${new Date().toISOString().slice(0, 10)}.json`)
    setIsError(false)
    setMessage('schemaVersion 2のJSONバックアップを書き出しました。')
  }

  const exportForAi = () => {
    downloadJson(createAiAnalysisExport(data, includeNotes), `job-hunt-manager-ai-analysis-${new Date().toISOString().slice(0, 10)}.json`)
    setIsError(false)
    setMessage(includeNotes ? '個人メモを含むAI分析用JSONを書き出しました。共有先を確認してください。' : '個人メモを除いたAI分析用JSONを書き出しました。')
  }

  const previewFile = async (file: File) => {
    try {
      const next = previewBackupImport(await file.text())
      setPreview(next)
      setIsError(false)
      setMessage(`${next.summary} まだ現在データは変更していません。`)
    } catch (error) {
      setPreview(null)
      setIsError(true)
      setMessage(error instanceof Error ? error.message : 'バックアップを検証できませんでした。')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const commitPreview = () => {
    if (!preview) return
    onImport(preview.data)
    setMessage(`${preview.companyCount}社を取り込みました。`)
    setPreview(null)
  }

  const clearData = () => {
    if (window.confirm('本人用データをすべて削除しますか？この操作は元に戻せません。先にバックアップしてください。')) {
      onClear()
      setIsError(false)
      setMessage('本人用データを削除しました。')
    }
  }

  return (
    <section className="page-stack" aria-labelledby="data-title">
      <div className="page-heading compact-heading"><div><p className="eyebrow">DATA &amp; PRIVACY</p><h1 id="data-title">データ管理</h1><p>保存先を確認し、検証・プレビュー・承認の順で安全に取り込みます。</p></div></div>

      <div className={`mode-banner ${mode}`}>
        <div className="mode-banner-icon" aria-hidden="true">{mode === 'demo' ? 'D' : 'P'}</div>
        <div><strong>{mode === 'demo' ? '公開デモモード' : '本人用モード'}</strong><p>{mode === 'demo' ? '完全な架空データです。変更しても再読み込みで初期状態へ戻せます。' : `${storageLabel} / 状態: ${syncStatus}。秘密情報やOAuth tokenはデータへ保存しません。`}</p></div>
      </div>

      {message && <div className={isError ? 'notice error' : 'notice success'} role="status">{message}</div>}
      {preview && (
        <article className="panel import-preview">
          <div><p className="eyebrow">IMPORT PREVIEW</p><h2>取り込み前の確認</h2><p>{preview.summary}</p><p>現在: {data.userCompanies.length}社 → 取込後: {preview.companyCount}社 / 元schema: v{preview.sourceVersion}</p></div>
          <div className="inline-actions"><button className="secondary-button" type="button" onClick={() => { setPreview(null); setMessage('取り込みをキャンセルしました。') }}>キャンセル</button><button className="primary-button" type="button" onClick={commitPreview}>この内容を反映</button></div>
        </article>
      )}

      <div className="data-card-grid">
        <article className="data-card"><span className="data-card-number">01</span><h2>v2バックアップ</h2><p>{data.userCompanies.length}社、評価設定、Fact、WatchをschemaVersion 2で書き出します。</p><button className="secondary-button" type="button" onClick={exportData}>JSONを書き出す</button></article>
        <article className="data-card"><span className="data-card-number">02</span><h2>安全に読み込む</h2><p>v1とv2に対応。まずruntime validationし、プレビュー後にだけ反映します。</p><input ref={fileRef} className="sr-only" id="backup-file" type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void previewFile(event.target.files[0])} /><label className="secondary-button label-button" htmlFor="backup-file">JSONを選ぶ</label></article>
        <article className="data-card"><span className="data-card-number">03</span><h2>AI分析用</h2><p>ChatGPT等へ渡す構造化JSONです。既定では個人メモと面接場所を除きます。</p><label className="toggle-field"><input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} /><span>個人メモも含める</span></label><button className="secondary-button" type="button" onClick={exportForAi}>AI分析用を書き出す</button></article>
        <article className="data-card caution"><span className="data-card-number">04</span><h2>{mode === 'demo' ? 'デモを初期化' : '本人用データを削除'}</h2><p>{mode === 'demo' ? '編集した架空データを初期状態へ戻します。' : 'バックアップがなければ復元できません。'}</p><button className={mode === 'demo' ? 'secondary-button' : 'danger-button'} type="button" onClick={mode === 'demo' ? onResetDemo : clearData}>{mode === 'demo' ? 'デモを初期化' : 'すべて削除'}</button></article>
      </div>

      <article className="panel privacy-panel"><div><p className="eyebrow">SAFETY CHECK</p><h2>入力前に確認</h2></div><ul><li>公開デモ・テスト・スクリーンショットには架空データだけを使う。</li><li>パスワード、Cookie、APIキー、OAuth token、担当者の連絡先を保存しない。</li><li>JSONは型だけでなくZodで実行時検証し、失敗時は現在データを変更しない。</li><li>AI出力は候補。差分を確認し、承認した項目だけを反映する。</li></ul></article>
    </section>
  )
}
