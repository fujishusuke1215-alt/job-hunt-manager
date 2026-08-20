import type { AppMode, ViewName } from '../types'
import { ModeSwitch } from './ModeSwitch'

interface AppShellProps {
  children: React.ReactNode
  mode: AppMode
  view: ViewName
  onModeChange: (mode: AppMode) => void
  onViewChange: (view: ViewName) => void
}

const navItems: { view: ViewName; label: string; short: string }[] = [
  { view: 'dashboard', label: 'ダッシュボード', short: '概要' },
  { view: 'companies', label: '企業・選考管理', short: '企業' },
  { view: 'data', label: 'データ管理', short: '保存' },
]

export function AppShell({ children, mode, view, onModeChange, onViewChange }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => onViewChange('dashboard')}>
          <span className="brand-mark" aria-hidden="true">J</span>
          <span>
            <strong>Job Hunt Manager</strong>
            <small>選考を、次の行動へ。</small>
          </span>
        </button>
        <ModeSwitch mode={mode} onChange={onModeChange} />
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="メインメニュー">
          <nav>
            {navItems.map((item) => (
              <button
                key={item.view}
                type="button"
                className={view === item.view ? 'nav-item active' : 'nav-item'}
                onClick={() => onViewChange(item.view)}
                aria-label={item.label}
                aria-current={view === item.view ? 'page' : undefined}
              >
                <span className="nav-dot" aria-hidden="true" />
                <span className="nav-label">{item.label}</span>
                <span className="nav-short">{item.short}</span>
              </button>
            ))}
          </nav>
          <div className="privacy-note">
            <span aria-hidden="true">●</span>
            <p>{mode === 'demo' ? '架空データのみ表示中' : 'このブラウザー内だけに保存'}</p>
          </div>
        </aside>
        <main className="main-content">{children}</main>
      </div>
    </div>
  )
}
