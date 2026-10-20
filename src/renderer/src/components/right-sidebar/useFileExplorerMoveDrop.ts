import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { basename, dirname, joinPath } from '@/lib/path'
import { executeOpenEditorPathMove } from '@/lib/execute-open-editor-path-move'
import { commitFileExplorerOp } from './fileExplorerUndoRedo'
import type { FileExplorerOperationOwner } from './file-explorer-types'
import { captureFileExplorerOperationGuard } from './file-explorer-operation-owner'
import { planFileExplorerMoveDrop } from './file-explorer-move-drop-plan'
import { useAppStore } from '@/store'

function extractIpcErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) {
    return fallback
  }
  const match = err.message.match(/Error invoking remote method '[^']*': (?:Error: )?(.+)/)
  return match ? match[1] : err.message
}

type UseFileExplorerMoveDropParams = {
  worktreePath: string | null
  activeWorktreeId: string | null
  refreshDir: (dirPath: string) => Promise<void>
  getOperationOwnerForPath: (path: string) => FileExplorerOperationOwner | undefined
  setDropTargetDir: (dir: string | null) => void
}

export type FileExplorerMoveConfirmRequest = {
  worktreeId: string
  sourcePaths: string[]
  destDir: string
}

export type UseFileExplorerMoveDropResult = {
  handleMoveDrop: (sourcePaths: string[], destDir: string) => void
  moveConfirmRequest: FileExplorerMoveConfirmRequest | null
  confirmMove: (dontAskAgain: boolean) => void
  cancelMove: () => void
}

export function useFileExplorerMoveDrop({
  worktreePath,
  activeWorktreeId,
  refreshDir,
  getOperationOwnerForPath,
  setDropTargetDir
}: UseFileExplorerMoveDropParams): UseFileExplorerMoveDropResult {
  const [moveConfirmRequest, setMoveConfirmRequest] =
    useState<FileExplorerMoveConfirmRequest | null>(null)

  const runMove = useCallback(
    (sourcePath: string, destDir: string) => {
      if (!worktreePath || !activeWorktreeId) {
        return
      }
      const fileName = basename(sourcePath),
        sourceDir = dirname(sourcePath)
      const newPath = joinPath(destDir, fileName)
      const operationOwner = getOperationOwnerForPath(sourcePath)

      const run = async (): Promise<void> => {
        try {
          const operationGuard = captureFileExplorerOperationGuard(activeWorktreeId, operationOwner)
          const operationRoute = operationGuard.route
          const fileContext = {
            target: operationRoute.target,
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId: operationRoute.connectionId,
            expectedExecutionHostId: operationRoute.expectedExecutionHostId,
            expectedSshTargetId: operationRoute.expectedSshTargetId,
            expectedSshConnectionGeneration: operationRoute.expectedSshConnectionGeneration
          }
          operationGuard.assertCurrent()
          await executeOpenEditorPathMove({
            context: fileContext,
            fromPath: sourcePath,
            toPath: newPath,
            worktreeId: activeWorktreeId,
            worktreePath
          })
          commitFileExplorerOp({
            undo: async () => {
              operationGuard.assertCurrent()
              await executeOpenEditorPathMove({
                context: fileContext,
                fromPath: newPath,
                toPath: sourcePath,
                worktreeId: activeWorktreeId,
                worktreePath
              })
              await Promise.all([refreshDir(destDir), refreshDir(sourceDir)])
            },
            redo: async () => {
              operationGuard.assertCurrent()
              await executeOpenEditorPathMove({
                context: fileContext,
                fromPath: sourcePath,
                toPath: newPath,
                worktreeId: activeWorktreeId,
                worktreePath
              })
              await Promise.all([refreshDir(sourceDir), refreshDir(destDir)])
            }
          })
        } catch (err) {
          toast.error(extractIpcErrorMessage(err, `Failed to move '${fileName}'.`))
          return
        }
        await Promise.all([refreshDir(sourceDir), refreshDir(destDir)])
      }
      void run()
    },
    [worktreePath, activeWorktreeId, refreshDir, getOperationOwnerForPath]
  )

  const handleMoveDrop = useCallback(
    (sourcePaths: string[], destDir: string) => {
      setDropTargetDir(null)
      if (!worktreePath || !activeWorktreeId) {
        return
      }
      const movingPaths = planFileExplorerMoveDrop(sourcePaths, destDir)
      if (movingPaths.length === 0) {
        return
      }
      // Why: read at drop time so a toggle flipped in Settings applies to the very next drag.
      if (!(useAppStore.getState().settings?.confirmExplorerDragAndDrop ?? true)) {
        for (const sourcePath of movingPaths) {
          runMove(sourcePath, destDir)
        }
        return
      }
      setMoveConfirmRequest({
        worktreeId: activeWorktreeId,
        sourcePaths: movingPaths,
        destDir
      })
    },
    [worktreePath, activeWorktreeId, runMove, setDropTargetDir]
  )

  const confirmMove = useCallback(
    (dontAskAgain: boolean) => {
      if (!moveConfirmRequest) {
        return
      }
      setMoveConfirmRequest(null)
      // Why: the dialog can outlive a worktree switch; never run old paths against the new worktree.
      if (moveConfirmRequest.worktreeId !== activeWorktreeId) {
        return
      }
      if (dontAskAgain) {
        void useAppStore.getState().updateSettings({ confirmExplorerDragAndDrop: false })
      }
      for (const sourcePath of moveConfirmRequest.sourcePaths) {
        runMove(sourcePath, moveConfirmRequest.destDir)
      }
    },
    [moveConfirmRequest, activeWorktreeId, runMove]
  )

  const cancelMove = useCallback(() => setMoveConfirmRequest(null), [])

  return { handleMoveDrop, moveConfirmRequest, confirmMove, cancelMove }
}
