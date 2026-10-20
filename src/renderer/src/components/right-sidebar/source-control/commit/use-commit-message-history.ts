import type React from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { getRuntimeGitHistory } from '@/runtime/runtime-git-status-client'
import { GIT_HISTORY_DEFAULT_LIMIT } from '../../../../../../shared/git-history-types'
import { getWorktreeGitOwnerTarget } from '../../worktree-git-owner-target'
import {
  IDLE_COMMIT_HISTORY_NAV,
  isCaretOnFirstLine,
  isCaretOnLastLine,
  normalizeCommitHistoryMessages,
  stepCommitHistory,
  type CommitHistoryDirection,
  type CommitHistoryStep
} from './commit-message-history-navigation'

type HistoryCache = {
  worktreeId: string
  messages: Promise<string[]>
}

/**
 * Up/Down in the commit box cycles through `git log` messages of the worktree's HEAD, like VS Code.
 * History is fetched on focus (and after each commit) so the first Up doesn't wait on git.
 */
export function useCommitMessageHistory({
  worktreeId,
  worktreePath,
  connectionId,
  commitMessage,
  enabled,
  isCommitting,
  onCommitMessageChange
}: {
  worktreeId: string | null
  worktreePath: string | null
  connectionId: string | null | undefined
  commitMessage: string
  enabled: boolean
  isCommitting: boolean
  onCommitMessageChange: (message: string) => void
}): {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onFocus: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
} {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const cacheRef = useRef<HistoryCache | null>(null)
  const lastStepRef = useRef<CommitHistoryStep | null>(null)
  const caretPendingRef = useRef(false)

  // Why: any change we didn't make (typing, AI fill, post-commit clear, worktree switch) ends the session.
  useEffect(() => {
    if (lastStepRef.current && commitMessage !== lastStepRef.current.value) {
      lastStepRef.current = null
    }
  }, [commitMessage])

  // Why: Cmd/Ctrl+Enter commits without blurring the box, so a finished commit must drop the cache too.
  useEffect(() => {
    if (!isCommitting) {
      cacheRef.current = null
    }
  }, [isCommitting])

  useLayoutEffect(() => {
    const step = lastStepRef.current
    const textarea = textareaRef.current
    if (!caretPendingRef.current || !step || !textarea || textarea.value !== step.value) {
      return
    }
    caretPendingRef.current = false
    const position = step.caret === 'start' ? 0 : step.value.length
    textarea.setSelectionRange(position, position)
    textarea.scrollTop = step.caret === 'start' ? 0 : textarea.scrollHeight
  }, [commitMessage])

  const loadMessages = useCallback(
    (refresh: boolean): Promise<string[]> | null => {
      if (!worktreeId || !worktreePath) {
        return null
      }
      const cached = cacheRef.current
      if (!refresh && cached?.worktreeId === worktreeId) {
        return cached.messages
      }
      const target = getWorktreeGitOwnerTarget(worktreeId)
      if (!target) {
        return null
      }
      const messages = getRuntimeGitHistory(
        { target, worktreeId, worktreePath, connectionId: connectionId ?? undefined },
        { limit: GIT_HISTORY_DEFAULT_LIMIT, baseRef: null }
      )
        .then((result) => normalizeCommitHistoryMessages(result.items))
        // Why: history is a convenience; a failed read (unborn branch, folder, offline host) just means no recall.
        .catch(() => [])
      cacheRef.current = { worktreeId, messages }
      return messages
    },
    [connectionId, worktreeId, worktreePath]
  )

  // Why: refetch on every focus so commits made in a terminal or by an agent show up.
  const onFocus = useCallback(() => {
    if (enabled) {
      void loadMessages(true)
    }
  }, [enabled, loadMessages])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        !enabled ||
        (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.nativeEvent.isComposing
      ) {
        return
      }
      const { value, selectionStart, selectionEnd } = event.currentTarget
      const direction: CommitHistoryDirection = event.key === 'ArrowUp' ? 'older' : 'newer'
      const nav = lastStepRef.current?.nav ?? IDLE_COMMIT_HISTORY_NAV
      const atEdge =
        direction === 'older'
          ? isCaretOnFirstLine(value, selectionStart, selectionEnd)
          : isCaretOnLastLine(value, selectionStart, selectionEnd)
      if (!atEdge || (direction === 'newer' && nav.index === -1)) {
        return
      }
      const messages = loadMessages(false)
      if (!messages) {
        return
      }
      event.preventDefault()
      const textarea = event.currentTarget
      void messages.then((list) => {
        // Why: the fetch may still be in flight; drop the step if the user typed or left meanwhile.
        if (textarea.value !== value || document.activeElement !== textarea) {
          return
        }
        const step = stepCommitHistory(nav, list, direction, value)
        if (step) {
          lastStepRef.current = step
          caretPendingRef.current = true
          onCommitMessageChange(step.value)
        }
      })
    },
    [enabled, loadMessages, onCommitMessageChange]
  )

  return { textareaRef, onFocus, onKeyDown }
}
