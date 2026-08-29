import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createEmptyAppData } from '../domain/migration'
import { ScoringSettings } from './ScoringSettings'

describe('ScoringSettings', () => {
  it('hides the developer reference template when used by the public demo', () => {
    render(<ScoringSettings data={createEmptyAppData('2026-08-29T00:00:00.000Z')} onChange={vi.fn()} hideDeveloperReference />)

    expect(screen.getByRole('option', { name: 'バランス型' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '開発者参考テンプレート' })).not.toBeInTheDocument()
  })

  it('keeps the developer reference template available outside the public demo', () => {
    render(<ScoringSettings data={createEmptyAppData('2026-08-29T00:00:00.000Z')} onChange={vi.fn()} />)

    expect(screen.getByRole('option', { name: '開発者参考テンプレート' })).toBeInTheDocument()
  })
})
