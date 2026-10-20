import { describe, expect, it } from 'vitest'
import type { GitHistoryItem } from '../../../../../../shared/git-history-types'
import {
  IDLE_COMMIT_HISTORY_NAV,
  isCaretOnFirstLine,
  isCaretOnLastLine,
  normalizeCommitHistoryMessages,
  stepCommitHistory
} from './commit-message-history-navigation'

function item(message: string, subject = message.split('\n')[0]): GitHistoryItem {
  return { id: message, parentIds: [], subject, message }
}

describe('caret edge detection', () => {
  it('treats a single-line value as both first and last line', () => {
    expect(isCaretOnFirstLine('abc', 1, 1)).toBe(true)
    expect(isCaretOnLastLine('abc', 1, 1)).toBe(true)
  })

  it('distinguishes lines in a multi-line value', () => {
    const value = 'one\ntwo'
    expect(isCaretOnFirstLine(value, 2, 2)).toBe(true)
    expect(isCaretOnLastLine(value, 2, 2)).toBe(false)
    expect(isCaretOnFirstLine(value, 5, 5)).toBe(false)
    expect(isCaretOnLastLine(value, 5, 5)).toBe(true)
  })

  it('ignores a non-collapsed selection', () => {
    expect(isCaretOnFirstLine('abc', 0, 2)).toBe(false)
    expect(isCaretOnLastLine('abc', 0, 2)).toBe(false)
  })
})

describe('normalizeCommitHistoryMessages', () => {
  it('trims, drops empties, and collapses adjacent duplicates', () => {
    expect(
      normalizeCommitHistoryMessages([
        item('fix: a\n'),
        item('fix: a'),
        item('', ''),
        item('feat: b\n\nbody\n'),
        item('fix: a')
      ])
    ).toEqual(['fix: a', 'feat: b\n\nbody', 'fix: a'])
  })

  it('falls back to the subject when the message is missing', () => {
    expect(normalizeCommitHistoryMessages([item('', 'subject only')])).toEqual(['subject only'])
  })
})

describe('stepCommitHistory', () => {
  const messages = ['newest', 'middle', 'oldest']

  it('walks older from the draft and back to it', () => {
    const first = stepCommitHistory(IDLE_COMMIT_HISTORY_NAV, messages, 'older', 'my draft')
    expect(first).toEqual({ nav: { index: 0, draft: 'my draft' }, value: 'newest', caret: 'start' })
    const second = stepCommitHistory(first!.nav, messages, 'older', first!.value)
    expect(second?.value).toBe('middle')
    const back = stepCommitHistory(second!.nav, messages, 'newer', second!.value)
    expect(back).toEqual({ nav: { index: 0, draft: 'my draft' }, value: 'newest', caret: 'end' })
    const draft = stepCommitHistory(back!.nav, messages, 'newer', back!.value)
    expect(draft).toEqual({
      nav: { index: -1, draft: 'my draft' },
      value: 'my draft',
      caret: 'end'
    })
  })

  it('stops at the oldest message', () => {
    expect(stepCommitHistory({ index: 2, draft: '' }, messages, 'older', 'oldest')).toBeNull()
  })

  it('leaves Down alone when the draft is showing', () => {
    expect(stepCommitHistory(IDLE_COMMIT_HISTORY_NAV, messages, 'newer', 'draft')).toBeNull()
  })

  it('skips the newest message when the draft already equals it', () => {
    expect(stepCommitHistory(IDLE_COMMIT_HISTORY_NAV, messages, 'older', 'newest\n')?.value).toBe(
      'middle'
    )
  })

  it('does nothing without history', () => {
    expect(stepCommitHistory(IDLE_COMMIT_HISTORY_NAV, [], 'older', '')).toBeNull()
  })
})
