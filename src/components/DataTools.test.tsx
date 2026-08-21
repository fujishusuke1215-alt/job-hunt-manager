import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createEmptyAppData } from '../domain/migration'
import { createImportPreview } from '../repositories/types'
import { DataTools } from './DataTools'

function backupFile(raw: string): File {
  const file = new File([raw], 'backup.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => raw })
  return file
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise!: () => void
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

const data = createEmptyAppData('2026-08-21T00:00:00.000Z')
const raw = JSON.stringify(data)

describe('DataTools repository import flow', () => {
  it('preview後も未変更で、commit完了前に成功表示しない', async () => {
    const user = userEvent.setup()
    const pending = deferred()
    const onPreviewImport = vi.fn(async (value: string) => createImportPreview(value, '2026-08-21T01:00:00.000Z'))
    const onCommitImport = vi.fn(() => pending.promise)

    render(
      <DataTools
        mode="personal"
        data={data}
        storageLabel="ローカル開発モード"
        syncStatus="synced"
        onPreviewImport={onPreviewImport}
        onCommitImport={onCommitImport}
        onClear={vi.fn()}
        onResetDemo={vi.fn()}
      />,
    )

    await user.upload(screen.getByLabelText('JSONを選ぶ'), backupFile(raw))
    expect(await screen.findByRole('heading', { name: '取り込み前の確認' })).toBeInTheDocument()
    expect(onPreviewImport).toHaveBeenCalledWith(raw)
    expect(onCommitImport).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'この内容を反映' }))
    expect(screen.getByRole('button', { name: '反映中…' })).toBeDisabled()
    expect(screen.queryByText(/保存先への反映が完了/)).not.toBeInTheDocument()

    pending.resolve()
    expect(await screen.findByText('0社を取り込み、保存先への反映が完了しました。')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '取り込み前の確認' })).not.toBeInTheDocument()
  })

  it('commit失敗時はpreviewを残し、成功したように表示しない', async () => {
    const user = userEvent.setup()
    const preview = createImportPreview(raw, '2026-08-21T01:00:00.000Z')

    render(
      <DataTools
        mode="personal"
        data={data}
        storageLabel="ローカル開発モード"
        syncStatus="synced"
        onPreviewImport={vi.fn(async () => preview)}
        onCommitImport={vi.fn(async () => { throw new Error('競合のため反映していません。') })}
        onClear={vi.fn()}
        onResetDemo={vi.fn()}
      />,
    )

    await user.upload(screen.getByLabelText('JSONを選ぶ'), backupFile(raw))
    await user.click(await screen.findByRole('button', { name: 'この内容を反映' }))

    expect(await screen.findByText('競合のため反映していません。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '取り込み前の確認' })).toBeInTheDocument()
    expect(screen.queryByText(/保存先への反映が完了/)).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'この内容を反映' })).toBeEnabled())
  })

  it('demo commitは外部保存なしと明示する', async () => {
    const user = userEvent.setup()

    render(
      <DataTools
        mode="demo"
        data={data}
        storageLabel="架空データ（外部保存なし）"
        syncStatus="synced"
        onPreviewImport={vi.fn(async () => createImportPreview(raw, '2026-08-21T01:00:00.000Z'))}
        onCommitImport={vi.fn(async () => undefined)}
        onClear={vi.fn()}
        onResetDemo={vi.fn()}
      />,
    )

    await user.upload(screen.getByLabelText('JSONを選ぶ'), backupFile(raw))
    await user.click(await screen.findByRole('button', { name: 'この内容を反映' }))

    expect(await screen.findByText('0社を公開デモへ反映しました。外部保存はしていません。')).toBeInTheDocument()
  })
})
