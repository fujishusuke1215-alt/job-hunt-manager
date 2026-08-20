import { useRef, useState } from 'react'
import type { AppMode, Company } from '../types'
import { createBackup, parseBackup } from '../services/storage'

interface DataToolsProps {
  mode: AppMode
  companies: Company[]
  onImport: (companies: Company[]) => void
  onClear: () => void
  onResetDemo: () => void
}

export function DataTools({ mode, companies, onImport, onClear, onResetDemo }: DataToolsProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const exportData = () => {
    const blob = new Blob([JSON.stringify(createBackup(companies), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `job-hunt-manager-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setIsError(false)
    setMessage('JSONバックアップを書き出しました。保存先と内容はご自身で確認してください。')
  }

  const importData = async (file: File) => {
    try {
      const parsed = parseBackup(await file.text())
      onImport(parsed.companies)
      setIsError(false)
      setMessage(`${parsed.companies.length}社を読み込みました。`)
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error ? error.message : 'バックアップを読み込めませんでした。')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const clearData = () => {
    if (window.confirm('本人用データをすべて削除しますか？この操作は元に戻せません。')) {
      onClear()
      setIsError(false)
      setMessage('本人用データを削除しました。')
    }
  }

  return (
    <section className="page-stack" aria-labelledby="data-title">
      <div className="page-heading compact-heading">
        <div>
          <p className="eyebrow">DATA &amp; PRIVACY</p>
          <h1 id="data-title">データ管理</h1>
          <p>保存場所と公開デモの境界を確認し、安全にバックアップします。</p>
        </div>
      </div>

      <div className={`mode-banner ${mode}`}>
        <div className="mode-banner-icon" aria-hidden="true">{mode === 'demo' ? 'D' : 'P'}</div>
        <div>
          <strong>{mode === 'demo' ? '公開デモモード' : '本人用モード'}</strong>
          <p>{mode === 'demo' ? '完全な架空データです。変更しても外部へ送信されず、再読み込みで初期状態に戻せます。' : 'データはこのブラウザーのlocalStorageだけに保存されます。Gitやクラウドへ自動送信しません。'}</p>
        </div>
      </div>

      {message && <div className={isError ? 'notice error' : 'notice success'} role="status">{message}</div>}

      <div className="data-card-grid">
        <article className="data-card">
          <span className="data-card-number">01</span>
          <h2>バックアップを書き出す</h2>
          <p>{companies.length}社と選考予定を、構造を保ったJSONファイルへ保存します。</p>
          <button className="secondary-button" type="button" onClick={exportData}>JSONを書き出す</button>
        </article>
        <article className="data-card">
          <span className="data-card-number">02</span>
          <h2>バックアップを読み込む</h2>
          <p>Job Hunt Managerから書き出したschemaVersion 1のJSONだけを受け付けます。</p>
          <input ref={fileRef} className="sr-only" id="backup-file" type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void importData(event.target.files[0])} />
          <label className="secondary-button label-button" htmlFor="backup-file">JSONを選ぶ</label>
        </article>
        <article className="data-card caution">
          <span className="data-card-number">03</span>
          <h2>{mode === 'demo' ? 'デモを初期化する' : '本人用データを削除する'}</h2>
          <p>{mode === 'demo' ? '編集した架空データを、最初の4社へ戻します。' : 'バックアップがなければ復元できません。共有PCでは保存しないでください。'}</p>
          <button className={mode === 'demo' ? 'secondary-button' : 'danger-button'} type="button" onClick={mode === 'demo' ? onResetDemo : clearData}>
            {mode === 'demo' ? 'デモを初期化' : 'すべて削除'}
          </button>
        </article>
      </div>

      <article className="panel privacy-panel">
        <div>
          <p className="eyebrow">SAFETY CHECK</p>
          <h2>入力前に確認すること</h2>
        </div>
        <ul>
          <li>公開デモ・テスト・スクリーンショットには架空データだけを使う。</li>
          <li>パスワード、Cookie、APIキー、担当者の連絡先を入力しない。</li>
          <li>localStorageは暗号化された保管庫ではないため、共有PCでは本人用モードを使わない。</li>
          <li>GitHubへ載せるのはソース内の公開デモデータだけ。本人用データは自動では含まれない。</li>
        </ul>
      </article>
    </section>
  )
}

