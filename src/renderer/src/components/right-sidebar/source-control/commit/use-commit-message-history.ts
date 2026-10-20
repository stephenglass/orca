import type React from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { getConnectionId } from '@/lib/connection-context'
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
  type CommitHistoryNav
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
  commitMessage,
  enabled,
  isCommitting,
  onCommitMessageChange
}: {
  worktreeId: string | null
  worktreePath: string | null
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
  const navRef = useRef<CommitHistoryNav>(IDLE_COMMIT_HISTORY_NAV)
  const recalledValueRef = useRef<string | null>(null)
  const pendingCaretRef = useRef<{ value: string; caret: 'start' | 'end' } | null>(null)

  // Why: any change we didn't make (typing, AI fill, post-commit clear, worktree switch) ends the session.
  useEffect(() => {
    if (navRef.current.index !== -1 && commitMessage !== recalledValueRef.current) {
      navRef.current = IDLE_COMMIT_HISTORY_NAV
      recalledValueRef.current = null
    }
  }, [commitMessage])

  useEffect(() => {
    navRef.current = IDLE_COMMIT_HISTORY_NAV
    recalledValueRef.current = null
    cacheRef.current = null
  }, [worktreeId])

  // Why: a finished commit adds a message, so the next Up must refetch.
  useEffect(() => {
    if (!isCommitting) {
      cacheRef.current = null
    }
  }, [isCommitting])

  useLayoutEffect(() => {
    const pending = pendingCaretRef.current
    const textarea = textareaRef.current
    if (!pending || !textarea || textarea.value !== pending.value) {
      return
    }
    pendingCaretRef.current = null
    const position = pending.caret === 'start' ? 0 : pending.value.length
    textarea.setSelectionRange(position, position)
    textarea.scrollTop = pending.caret === 'start' ? 0 : textarea.scrollHeight
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
        {
          target,
          worktreeId,
          worktreePath,
          connectionId: getConnectionId(worktreeId) ?? undefined
        },
        { limit: GIT_HISTORY_DEFAULT_LIMIT, baseRef: null }
      )
        .then((result) => normalizeCommitHistoryMessages(result.items))
        // Why: history is a convenience; a failed read (unborn branch, folder, offline host) just means no recall.
        .catch(() => [])
      cacheRef.current = { worktreeId, messages }
      return messages
    },
    [worktreeId, worktreePath]
  )

  const onFocus = useCallback(() => {
    if (enabled) {
      void loadMessages(true)
    }
  }, [enabled, loadMessages])

  const applyStep = useCallback(
    (messages: string[], direction: CommitHistoryDirection, currentValue: string) => {
      const step = stepCommitHistory(navRef.current, messages, direction, currentValue)
      if (!step) {
        return
      }
      navRef.current = step.nav
      recalledValueRef.current = step.value
      pendingCaretRef.current = { value: step.value, caret: step.caret }
      onCommitMessageChange(step.value)
    },
    [onCommitMessageChange]
  )

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
      const atEdge =
        direction === 'older'
          ? isCaretOnFirstLine(value, selectionStart, selectionEnd)
          : isCaretOnLastLine(value, selectionStart, selectionEnd)
      if (!atEdge || (direction === 'newer' && navRef.current.index === -1)) {
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
        if (textarea.value === value && document.activeElement === textarea) {
          applyStep(list, direction, value)
        }
      })
    },
    [applyStep, enabled, loadMessages]
  )

  return { textareaRef, onFocus, onKeyDown }
}
