import type { AppMode, SyncStatus, ViewName } from '../domain/types'
import { ModeSwitch } from './ModeSwitch'

interface AppShellProps {
  children: React.ReactNode
  mode: AppMode
  view: ViewName
  syncStatus: SyncStatus
  storageLabel: string
  accountEmail?: string
  accountName?: string
  accountPictureUrl?: string | null
  authAvailable: boolean
  reconnectRequired: boolean
  onModeChange: (mode: AppMode) => void
  onViewChange: (view: ViewName) => void
  onLogin: () => void
  onReconnect: () => void
  onLogout: () => void
}

const navItems: { view: ViewName; label: string; short: string }[] = [
  { view: 'dashboard', label: 'ホーム', short: '概要' },
  { view: 'companies', label: '企業・選考', short: '企業' },
  { view: 'scoring', label: 'ランキング', short: '順位' },
  { view: 'data', label: '設定・履歴', short: '設定' },
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
  accountName,
  accountPictureUrl,
  authAvailable,
  reconnectRequired,
  onModeChange,
  onViewChange,
  onLogin,
  onReconnect,
  onLogout,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => onViewChange('dashboard')}>
          <span className="brand-mark" aria-hidden="true">J</span>
          <span><strong>Job Hunt Manager</strong><small>選考を、次の行動へ。</small></span>
        </button>
        <div className="topbar-status" aria-label={`保存状態 ${syncLabels[syncStatus]}${accountEmail ? ` / Google接続済み ${accountEmail}` : ''}`}>
          {accountPictureUrl && <img className="account-avatar" src={accountPictureUrl} alt="" referrerPolicy="no-referrer" />}
          <span className={`sync-dot ${syncStatus}`} aria-hidden="true" />
          <span><strong>{syncLabels[syncStatus]}</strong><small>{accountName ? `${accountName} / ${accountEmail}` : accountEmail ?? storageLabel}</small></span>
          {mode === 'personal' && authAvailable && (accountEmail
            ? <>{reconnectRequired && <button className="text-button" type="button" onClick={onReconnect}>再接続</button>}<button className="text-button" type="button" onClick={onLogout}>ログアウト</button></>
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
