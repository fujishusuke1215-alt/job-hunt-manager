import type { AppMode } from '../types'

interface ModeSwitchProps {
  mode: AppMode
  onChange: (mode: AppMode) => void
}

export function ModeSwitch({ mode, onChange }: ModeSwitchProps) {
  return (
    <div className="mode-switch" aria-label="利用モード">
      <button
        className={mode === 'demo' ? 'mode-button active' : 'mode-button'}
        type="button"
        onClick={() => onChange('demo')}
        aria-pressed={mode === 'demo'}
      >
        公開デモ
      </button>
      <button
        className={mode === 'personal' ? 'mode-button active' : 'mode-button'}
        type="button"
        onClick={() => onChange('personal')}
        aria-pressed={mode === 'personal'}
      >
        本人用
      </button>
    </div>
  )
}

