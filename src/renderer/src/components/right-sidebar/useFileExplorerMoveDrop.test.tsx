// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../shared/constants'
import { useFileExplorerMoveDrop } from './useFileExplorerMoveDrop'

const executeOpenEditorPathMove = vi.hoisted(() => vi.fn())

vi.mock('@/lib/execute-open-editor-path-move', () => ({ executeOpenEditorPathMove }))
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
  useAppStore.setState({
    settings: { ...getDefaultSettings('/tmp'), confirmExplorerDragAndDrop },
    updateSettings
  })
  const { result } = renderHook(() =>
    useFileExplorerMoveDrop({
      worktreePath: '/repo',
      activeWorktreeId: 'wt-1',
      refreshDir: vi.fn().mockResolvedValue(undefined),
      getOperationOwnerForPath: () => undefined,
      setDropTargetDir: vi.fn()
    })
  )
  return { result, updateSettings }
}

describe('useFileExplorerMoveDrop', () => {
  beforeEach(() => {
    executeOpenEditorPathMove.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    useAppStore.setState(initialState, true)
  })

  it('moves right away when confirmation is off', () => {
    const { result } = setup(false)
    act(() => result.current.handleMoveDrop(['/repo/a.ts', '/repo/b.ts'], '/repo/src'))

    expect(result.current.moveConfirmRequest).toBeNull()
    expect(executeOpenEditorPathMove).toHaveBeenCalledTimes(2)
  })

  it('asks once per drop and moves nothing until confirmed', () => {
    const { result, updateSettings } = setup(true)
    act(() => result.current.handleMoveDrop(['/repo/a.ts', '/repo/b.ts'], '/repo/src'))

    expect(result.current.moveConfirmRequest).toEqual({
      worktreeId: 'wt-1',
      sourcePaths: ['/repo/a.ts', '/repo/b.ts'],
      destDir: '/repo/src'
    })
    expect(executeOpenEditorPathMove).not.toHaveBeenCalled()

    act(() => result.current.confirmMove(false))

    expect(result.current.moveConfirmRequest).toBeNull()
    expect(executeOpenEditorPathMove).toHaveBeenCalledTimes(2)
    expect(executeOpenEditorPathMove).toHaveBeenCalledWith(
      expect.objectContaining({ fromPath: '/repo/a.ts', toPath: '/repo/src/a.ts' })
    )
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('turns confirmation off when "Do not ask me again" is checked', () => {
    const { result, updateSettings } = setup(true)
    act(() => result.current.handleMoveDrop(['/repo/a.ts'], '/repo/src'))
    act(() => result.current.confirmMove(true))

    expect(updateSettings).toHaveBeenCalledWith({ confirmExplorerDragAndDrop: false })
    expect(executeOpenEditorPathMove).toHaveBeenCalledTimes(1)
  })

  it('moves nothing on cancel', () => {
    const { result } = setup(true)
    act(() => result.current.handleMoveDrop(['/repo/a.ts'], '/repo/src'))
    act(() => result.current.cancelMove())

    expect(result.current.moveConfirmRequest).toBeNull()
    expect(executeOpenEditorPathMove).not.toHaveBeenCalled()
  })

  it('does not ask when the drop would not move anything', () => {
    const { result } = setup(true)
    act(() => result.current.handleMoveDrop(['/repo/src/a.ts'], '/repo/src'))

    expect(result.current.moveConfirmRequest).toBeNull()
    expect(executeOpenEditorPathMove).not.toHaveBeenCalled()
  })
})
