import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { basename, dirname, joinPath } from '@/lib/path'
import { executeOpenEditorPathMove } from '@/lib/execute-open-editor-path-move'
import { commitFileExplorerOp } from './fileExplorerUndoRedo'
import type { FileExplorerOperationOwner } from './file-explorer-types'
import { captureFileExplorerOperationGuard } from './file-explorer-operation-owner'
import { planFileExplorerMoveDrop } from './file-explorer-move-drop-plan'
import { useAppStore } from '@/store'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { buildFileExplorerMoveConfirmOptions } from './file-explorer-move-confirm-prompt'
import { translate } from '@/i18n/i18n'

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

export function useFileExplorerMoveDrop({
  worktreePath,
  activeWorktreeId,
  refreshDir,
  getOperationOwnerForPath,
  setDropTargetDir
}: UseFileExplorerMoveDropParams): (sourcePaths: string[], destDir: string) => void {
  const confirm = useConfirmationDialog()
  // Why: a prompt left open across a worktree switch must not move old paths in the new worktree.
  const worktreeAbortRef = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    worktreeAbortRef.current = controller
    return () => controller.abort()
  }, [worktreePath, activeWorktreeId])

  const runMoves = useCallback(
    async (sourcePaths: string[], destDir: string): Promise<void> => {
      if (!worktreePath || !activeWorktreeId) {
        return
      }
      const moveOne = async (sourcePath: string): Promise<string | null> => {
        const fileName = basename(sourcePath),
          sourceDir = dirname(sourcePath)
        const newPath = joinPath(destDir, fileName)
        const operationOwner = getOperationOwnerForPath(sourcePath)
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
          return null
        }
        return sourceDir
      }
      const movedFromDirs = await Promise.all(sourcePaths.map(moveOne))
      const changedDirs = new Set(movedFromDirs.filter((dir) => dir !== null))
      if (changedDirs.size > 0) {
        changedDirs.add(destDir)
        await Promise.all([...changedDirs].map((dir) => refreshDir(dir)))
      }
    },
    [worktreePath, activeWorktreeId, refreshDir, getOperationOwnerForPath]
  )

  return useCallback(
    (sourcePaths: string[], destDir: string) => {
      setDropTargetDir(null)
      const movingPaths = planFileExplorerMoveDrop(sourcePaths, destDir)
      if (movingPaths.length === 0) {
        return
      }
      const run = async (): Promise<void> => {
        // Why: read at drop time so a toggle flipped in Settings applies to the very next drag.
        if (useAppStore.getState().settings?.confirmExplorerDragAndDrop ?? true) {
          const confirmed = await confirm({
            ...buildFileExplorerMoveConfirmOptions(movingPaths, destDir),
            dontAskAgain: {
              label: translate(
                'auto.components.right.sidebar.useFileExplorerMoveDrop.dont_ask_again',
                'Do not ask me again'
              ),
              onConfirmed: () =>
                void useAppStore.getState().updateSettings({ confirmExplorerDragAndDrop: false })
            },
            signal: worktreeAbortRef.current.signal
          })
          if (!confirmed) {
            return
          }
        }
        await runMoves(movingPaths, destDir)
      }
      void run()
    },
    [confirm, runMoves, setDropTargetDir]
  )
}
