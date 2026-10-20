import type { GitHistoryItem } from '../../../../../../shared/git-history-types'

/** Position in the recalled-message list; index -1 means the user's own draft is showing. */
export type CommitHistoryNav = {
  index: number
  draft: string
}

export type CommitHistoryDirection = 'older' | 'newer'

export type CommitHistoryStep = {
  nav: CommitHistoryNav
  value: string
  caret: 'start' | 'end'
}

export const IDLE_COMMIT_HISTORY_NAV: CommitHistoryNav = { index: -1, draft: '' }

export function isCaretOnFirstLine(value: string, start: number, end: number): boolean {
  return start === end && !value.slice(0, start).includes('\n')
}

export function isCaretOnLastLine(value: string, start: number, end: number): boolean {
  return start === end && !value.slice(end).includes('\n')
}

/** Newest-first messages with trailing whitespace trimmed, empties dropped, and adjacent repeats collapsed. */
export function normalizeCommitHistoryMessages(items: readonly GitHistoryItem[]): string[] {
  const messages: string[] = []
  for (const item of items) {
    const message = (item.message || item.subject).trimEnd()
    if (message && messages.at(-1) !== message) {
      messages.push(message)
    }
  }
  return messages
}

/** The next recalled value, or null when the key should keep its native caret movement. */
export function stepCommitHistory(
  nav: CommitHistoryNav,
  messages: readonly string[],
  direction: CommitHistoryDirection,
  currentValue: string
): CommitHistoryStep | null {
  if (direction === 'older') {
    let index = nav.index + 1
    // Why: skip an entry identical to the draft so the first Up never looks like a no-op.
    if (nav.index === -1 && messages[0] === currentValue.trimEnd()) {
      index = 1
    }
    if (index >= messages.length) {
      return null
    }
    const draft = nav.index === -1 ? currentValue : nav.draft
    return { nav: { index, draft }, value: messages[index], caret: 'start' }
  }
  if (nav.index === -1) {
    return null
  }
  const index = nav.index - 1
  if (index === -1) {
    return { nav: { index: -1, draft: nav.draft }, value: nav.draft, caret: 'end' }
  }
  return { nav: { index, draft: nav.draft }, value: messages[index], caret: 'end' }
}
