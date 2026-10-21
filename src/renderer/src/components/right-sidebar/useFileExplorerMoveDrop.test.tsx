// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { ConfirmationDialogOptions } from '@/components/confirmation-dialog-context'
import { getDefaultSettings } from '../../../../shared/constants'
import { useFileExplorerMoveDrop } from './useFileExplorerMoveDrop'

const executeOpenEditorPathMove = vi.hoisted(() => vi.fn())
const confirm = vi.hoisted(() => vi.fn<(options: ConfirmationDialogOptions) => Promise<boolean>>())

vi.mock('@/lib/execute-open-editor-path-move', () => ({ executeOpenEditorPathMove }))
vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: () => confirm
}))
vi.mock('./fileExplorerUndoRedo', () => ({ commitFileExplorerOp: vi.fn() }))
vi.mock('./file-explorer-operation-owner', () => ({
  captureFileExplorerOperationGuard: () => ({
    route: { target: 'local' },
    assertCurrent: () => {}
  })
}))

const initialState = useAppStore.getInitialState()

function setup(confirmExplorerDragAndDrop: boolean) {
  const updateSettings = vi.fn().mockResolvedValue(undefined)
  const refreshDir = vi.fn().mockResolvedValue(undefined)
  useAppStore.setState({
    settings: { ...getDefaultSettings('/tmp'), confirmExplorerDragAndDrop },
    updateSettings
  })
  const { result } = renderHook(() =>
    useFileExplorerMoveDrop({
      worktreePath: '/repo',
      activeWorktreeId: 'wt-1',
      refreshDir,
      getOperationOwnerForPath: () => undefined,
      setDropTargetDir: vi.fn()
    })
  )
  return { handleMoveDrop: result.current, updateSettings, refreshDir }
}

async function drop(handleMoveDrop: (paths: string[], dir: string) => void, paths: string[]) {
  await act(async () => handleMoveDrop(paths, '/repo/src'))
}

describe('useFileExplorerMoveDrop', () => {
  beforeEach(() => {
    executeOpenEditorPathMove.mockReset().mockResolvedValue(undefined)
    confirm.mockReset()
  })

  afterEach(() => {
    useAppStore.setState(initialState, true)
  })

  it('moves right away when confirmation is off', async () => {
    const { handleMoveDrop } = setup(false)
    await drop(handleMoveDrop, ['/repo/a.ts', '/repo/b.ts'])

    expect(confirm).not.toHaveBeenCalled()
    expect(executeOpenEditorPathMove).toHaveBeenCalledTimes(2)
  })

  it('asks once per drop, then moves and refreshes each folder once', async () => {
    confirm.mockResolvedValue(true)
    const { handleMoveDrop, refreshDir } = setup(true)
    await drop(handleMoveDrop, ['/repo/a.ts', '/repo/b.ts'])

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0].title).toContain('following 2 files')
    expect(executeOpenEditorPathMove).toHaveBeenCalledWith(
      expect.objectContaining({ fromPath: '/repo/a.ts', toPath: '/repo/src/a.ts' })
    )
    expect(refreshDir.mock.calls.map(([dir]) => dir).sort()).toEqual(['/repo', '/repo/src'])
  })

  it('moves nothing when the prompt is cancelled', async () => {
    confirm.mockResolvedValue(false)
    const { handleMoveDrop } = setup(true)
    await drop(handleMoveDrop, ['/repo/a.ts'])

    expect(executeOpenEditorPathMove).not.toHaveBeenCalled()
  })

  it('turns confirmation off through "Do not ask me again"', async () => {
    confirm.mockResolvedValue(true)
    const { handleMoveDrop, updateSettings } = setup(true)
    await drop(handleMoveDrop, ['/repo/a.ts'])

    confirm.mock.calls[0][0].dontAskAgain?.onConfirmed()
    expect(updateSettings).toHaveBeenCalledWith({ confirmExplorerDragAndDrop: false })
  })

  it('does not ask when the drop would not move anything', async () => {
    const { handleMoveDrop } = setup(true)
    await drop(handleMoveDrop, ['/repo/src/a.ts'])

    expect(confirm).not.toHaveBeenCalled()
    expect(executeOpenEditorPathMove).not.toHaveBeenCalled()
  })
})
