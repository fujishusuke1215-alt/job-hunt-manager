import type { AppMode, SyncStatus, ViewName } from '../domain/types'
import { ModeSwitch } from './ModeSwitch'

interface AppShellProps {
  children: React.ReactNode
  mode: AppMode
  view: ViewName
  syncStatus: SyncStatus
  storageLabel: string
  accountEmail?: string
  authAvailable: boolean
  onModeChange: (mode: AppMode) => void
  onViewChange: (view: ViewName) => void
  onLogin: () => void
  onLogout: () => void
}

const navItems: { view: ViewName; label: string; short: string }[] = [
  { view: 'dashboard', label: 'ダッシュボード', short: '概要' },
  { view: 'companies', label: '企業・選考管理', short: '企業' },
  { view: 'scoring', label: '評価設定', short: '評価' },
  { view: 'ai-sync', label: 'AI同期', short: 'AI' },
  { view: 'watch', label: 'Watch', short: '監視' },
  { view: 'data', label: 'データ管理', short: '保存' },
]

const syncLabels: Record<SyncStatus, string> = {
  'signed-out': '未ログイン',
  loading: '読み込み中',
  synced: '同期済み',
  saving: '保存中',
  offline: 'オフライン / 失敗',
  conflict: '競合',
}

export function AppShell({
  children,
  mode,
  view,
  syncStatus,
  storageLabel,
  accountEmail,
  authAvailable,
  onModeChange,
  onViewChange,
  onLogin,
  onLogout,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => onViewChange('dashboard')}>
          <span className="brand-mark" aria-hidden="true">J</span>
          <span><strong>Job Hunt Manager</strong><small>選考を、次の行動へ。</small></span>
        </button>
        <div className="topbar-status" aria-label={`保存状態 ${syncLabels[syncStatus]}`}>
          <span className={`sync-dot ${syncStatus}`} aria-hidden="true" />
          <span><strong>{syncLabels[syncStatus]}</strong><small>{accountEmail ?? storageLabel}</small></span>
          {mode === 'personal' && authAvailable && (accountEmail
            ? <button className="text-button" type="button" onClick={onLogout}>ログアウト</button>
            : <button className="text-button" type="button" onClick={onLogin}>Googleで接続</button>)}
        </div>
        <ModeSwitch mode={mode} onChange={onModeChange} />
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="メインメニュー">
          <nav>
            {navItems.map((item) => (
              <button key={item.view} type="button" className={view === item.view ? 'nav-item active' : 'nav-item'} onClick={() => onViewChange(item.view)} aria-label={item.label} aria-current={view === item.view ? 'page' : undefined}>
                <span className="nav-dot" aria-hidden="true" /><span className="nav-label">{item.label}</span><span className="nav-short">{item.short}</span>
              </button>
            ))}
          </nav>
          <div className="privacy-note"><span aria-hidden="true">●</span><p>{mode === 'demo' ? '架空データのみ表示中' : storageLabel}</p></div>
        </aside>
        <main className="main-content">{children}</main>
      </div>
    </div>
  )
}
