import { useRef, useState } from 'react'
import type { AppDataV2, AppMode, SyncStatus } from '../domain/types'
import { createAiAnalysisExport, createV2Backup } from '../domain/backup'
import type { ImportPreview } from '../repositories/types'
import type { CsvPreview } from '../services/monitoringCsv'

interface DataToolsProps {
  mode: AppMode
  data: AppDataV2
  storageLabel: string
  syncStatus: SyncStatus
  onPreviewImport: (raw: string) => Promise<ImportPreview>
  onCommitImport: (preview: ImportPreview) => Promise<void>
  onPreviewCsvImport?: (raw: string) => CsvPreview
  onCommitCsvImport?: (preview: CsvPreview) => Promise<void>
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

export function DataTools({
  mode,
  data,
  storageLabel,
  syncStatus,
  onPreviewImport,
  onCommitImport,
  onPreviewCsvImport,
  onCommitCsvImport,
  onClear,
  onResetDemo,
}: DataToolsProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [isCommitting, setIsCommitting] = useState(false)
  const [includeNotes, setIncludeNotes] = useState(false)
  const csvFileRef = useRef<HTMLInputElement>(null)
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null)

  const exportData = () => {
    downloadJson(createV2Backup(data), `job-hunt-manager-backup-v2-${new Date().toISOString().slice(0, 10)}.json`)
    setIsError(false)
    setMessage('バックアップファイルを保存しました。')
  }

  const exportForAi = () => {
    downloadJson(createAiAnalysisExport(data, includeNotes), `job-hunt-manager-ai-analysis-${new Date().toISOString().slice(0, 10)}.json`)
    setIsError(false)
    setMessage(includeNotes ? '個人メモ・選考場所を含むAI分析用JSONを書き出しました。共有先を確認してください。' : '個人メモ・選考場所を除いたAI分析用JSONを書き出しました。')
  }

  const previewFile = async (file: File) => {
    try {
      const next = await onPreviewImport(await file.text())
      setPreview(next)
      setIsError(false)
      setMessage(`schemaVersion ${next.sourceSchemaVersion}の${next.summary.userCompanyCount}社を取り込む候補です。まだ現在データは変更していません。`)
    } catch (error) {
      setPreview(null)
      setIsError(true)
      setMessage(error instanceof Error ? error.message : 'バックアップを検証できませんでした。')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const commitPreview = async () => {
    if (!preview) return
    setIsCommitting(true)
    setIsError(false)
    setMessage('')
    try {
      await onCommitImport(preview)
      setMessage(mode === 'demo'
        ? `${preview.summary.userCompanyCount}社を公開デモへ反映しました。外部保存はしていません。`
        : `${preview.summary.userCompanyCount}社を取り込み、保存先への反映が完了しました。`)
      setPreview(null)
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error ? error.message : 'バックアップを反映できませんでした。現在データは変更していません。')
    } finally {
      setIsCommitting(false)
    }
  }

  const clearData = () => {
    if (window.confirm('本人用データをすべて削除しますか？この操作は元に戻せません。先にバックアップしてください。')) {
      onClear()
      setIsError(false)
      setMessage('本人用データを削除しました。')
    }
  }
  const previewCsvFile = async (file: File) => { if(!onPreviewCsvImport)return; try { const next=onPreviewCsvImport(await file.text()); setCsvPreview(next); setIsError(false); setMessage(`${next.rows}行を確認しました。まだ取り込んでいません。`) } catch(error) { setCsvPreview(null); setIsError(true); setMessage(error instanceof Error ? error.message : 'CSVを検証できませんでした。') } finally { if(csvFileRef.current) csvFileRef.current.value='' } }
  const commitCsvPreview = async () => { if(!csvPreview||!onCommitCsvImport)return; setIsCommitting(true); try { await onCommitCsvImport(csvPreview); setCsvPreview(null); setIsError(false); setMessage('CSVの候補企業を保存し、監視対象への同期を完了しました。') } catch(error) { setIsError(true); setMessage(error instanceof Error ? error.message : 'CSVを保存できませんでした。') } finally { setIsCommitting(false) } }

  return (
    <section className="page-stack" aria-labelledby="data-title">
      <div className="page-heading compact-heading"><div><p className="eyebrow">DATA &amp; PRIVACY</p><h1 id="data-title">データ管理</h1><p>企業・選考情報のバックアップ保存や復元を行うページです。</p></div></div>

      <div className={`mode-banner ${mode}`}>
        <div className="mode-banner-icon" aria-hidden="true">{mode === 'demo' ? 'D' : 'P'}</div>
        <div><strong>{mode === 'demo' ? '公開デモモード' : '本人用モード'}</strong><p>{mode === 'demo' ? '完全な架空データです。変更しても再読み込みで初期状態へ戻せます。' : `${storageLabel} / 状態: ${syncStatus}。秘密情報やOAuth tokenはデータへ保存しません。`}</p></div>
      </div>

      {message && <div className={isError ? 'notice error' : 'notice success'} role="status">{message}</div>}
      {preview && (
        <article className="panel import-preview">
          <div><p className="eyebrow">IMPORT PREVIEW</p><h2>取り込み前の確認</h2><p>schemaVersion {preview.sourceSchemaVersion}のバックアップです。</p><p>現在: {data.userCompanies.length}社 → 取込後: {preview.summary.userCompanyCount}社 / Fact: {preview.summary.researchFactCount}件 / Watch: {preview.summary.watchFindingCount}件</p>{preview.legacyBackup && <p>v1原文は反映時にこのブラウザーのlocalStorageへlegacy backupとして退避し、保存先には変換済みv2を保存します。</p>}{preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
          <div className="inline-actions"><button className="secondary-button" type="button" disabled={isCommitting} onClick={() => { setPreview(null); setMessage('取り込みをキャンセルしました。') }}>キャンセル</button><button className="primary-button" type="button" disabled={isCommitting} onClick={() => void commitPreview()}>{isCommitting ? '反映中…' : 'この内容を反映'}</button></div>
        </article>
      )}
      {csvPreview && <article className="panel import-preview"><div><p className="eyebrow">CSV IMPORT PREVIEW</p><h2>初期投入前の確認</h2><p>{csvPreview.rows}行 / 現在: {data.userCompanies.length}社 → 取込後: {csvPreview.candidates.length}社</p>{csvPreview.warnings.map(warning => <p key={warning}>{warning}</p>)}<p>ランキング、選考、評価、承認済みFactは変更しません。</p></div><div className="inline-actions"><button className="secondary-button" type="button" disabled={isCommitting} onClick={()=>setCsvPreview(null)}>キャンセル</button><button className="primary-button" type="button" disabled={isCommitting} onClick={()=>void commitCsvPreview()}>{isCommitting?'反映中…':'この内容を初期投入'}</button></div></article>}

      <div className="data-card-grid">
        <article className="data-card"><span className="data-card-number">01</span><h2>バックアップを保存</h2><p>現在登録している企業・評価・選考情報を1つのファイルとして手元に保存します。PC変更時や万一に備えたバックアップとして利用できます。</p><button className="secondary-button" type="button" onClick={exportData}>バックアップファイルを保存</button><small>ファイル形式：JSON</small></article>
        <article className="data-card"><span className="data-card-number">02</span><h2>バックアップから復元</h2><p>以前Job Hunt Managerから保存したバックアップファイルを読み込み、企業・選考情報を復元します。</p><input aria-label="JSONを選ぶ" ref={fileRef} className="sr-only" id="backup-file" type="file" accept="application/json,.json" disabled={isCommitting} onChange={(event) => event.target.files?.[0] && void previewFile(event.target.files[0])} /><label className="secondary-button label-button" htmlFor="backup-file">バックアップファイルを選択</label></article>
        {onPreviewCsvImport && onCommitCsvImport && <article className="data-card"><span className="data-card-number">CSV</span><h2>候補企業を初期投入</h2><p>Phase 0.6形式のCSVを確認してから取り込みます。認証情報を含むCSVは受け付けません。</p><input aria-label="CSVを選ぶ" ref={csvFileRef} className="sr-only" id="csv-file" type="file" accept="text/csv,.csv" disabled={isCommitting} onChange={(event) => event.target.files?.[0] && void previewCsvFile(event.target.files[0])} /><label className="secondary-button label-button" htmlFor="csv-file">CSVを選択</label></article>}
        <article className="data-card"><span className="data-card-number">03</span><h2>AI分析用</h2><p>ChatGPT等へ渡す構造化JSONです。既定では企業メモ・イベントメモ・選考場所を除きます。</p><label className="toggle-field"><input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} /><span>個人メモ・選考場所も含める</span></label><button className="secondary-button" type="button" onClick={exportForAi}>AI分析用を書き出す</button></article>
        <article className="data-card caution"><span className="data-card-number">04</span><h2>{mode === 'demo' ? 'デモを初期化' : '本人用データを削除'}</h2><p>{mode === 'demo' ? '編集した架空データを初期状態へ戻します。' : 'バックアップがなければ復元できません。'}</p><button className={mode === 'demo' ? 'secondary-button' : 'danger-button'} type="button" onClick={mode === 'demo' ? onResetDemo : clearData}>{mode === 'demo' ? 'デモを初期化' : 'すべて削除'}</button></article>
      </div>

      <article className="panel privacy-panel"><div><p className="eyebrow">SAFETY CHECK</p><h2>入力前に確認</h2></div><ul><li>公開デモ・テスト・スクリーンショットには架空データだけを使う。</li><li>パスワード、Cookie、APIキー、OAuth token、担当者の連絡先を保存しない。</li><li>JSONは型だけでなくZodで実行時検証し、失敗時は現在データを変更しない。</li><li>AI出力は候補。差分を確認し、承認した項目だけを反映する。</li></ul></article>
    </section>
  )
}
