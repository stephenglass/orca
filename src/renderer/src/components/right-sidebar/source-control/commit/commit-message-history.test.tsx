// @vitest-environment happy-dom
import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { GitHistoryItem } from '../../../../../../shared/git-history-types'
import { CommitArea } from './commit-area'
import { resolveCommitAreaPrimaryAction } from '../../source-control-primary-action'
import { resolveDropdownItems } from '../../source-control-dropdown-items'

const getRuntimeGitHistory = vi.fn()

vi.mock('@/runtime/runtime-git-status-client', () => ({
  getRuntimeGitHistory: (...args: unknown[]) => getRuntimeGitHistory(...args)
}))
vi.mock('../../worktree-git-owner-target', () => ({
  getWorktreeGitOwnerTarget: () => ({ kind: 'local' })
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => null }))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

function item(message: string): GitHistoryItem {
  return { id: message, parentIds: [], subject: message.split('\n')[0], message }
}

function Harness({ initial = '' }: { initial?: string }): React.JSX.Element {
  const [message, setMessage] = useState(initial)
  const inputs = {
    stagedCount: 1,
    hasUnstagedChanges: false,
    hasStageableChanges: false,
    hasPartiallyStagedChanges: false,
    hasMessage: message.trim().length > 0,
    hasUnresolvedConflicts: false,
    isCommitting: false,
    isRemoteOperationActive: false,
    upstreamStatus: { hasUpstream: true, ahead: 0, behind: 0 }
  }
  return (
    <CommitArea
      worktreeId="wt-1"
      worktreePath="/repo"
      groupId="group-1"
      commitMessage={message}
      commitError={null}
      commitFailureRecoveryPrompt={null}
      pushRecovery={null}
      remoteActionError={null}
      isCommitting={false}
      isFixingCommitFailureWithAI={false}
      isFixingPushFailureWithAI={false}
      sourceControlAiActionsVisible={false}
      aiAgentConfigured={false}
      isGenerating={false}
      generateError={null}
      stagedCount={1}
      hasPartiallyStagedChanges={false}
      hasUnresolvedConflicts={false}
      isRemoteOperationActive={false}
      inFlightRemoteOpKind={null}
      primaryAction={resolveCommitAreaPrimaryAction(inputs)}
      dropdownItems={resolveDropdownItems(inputs)}
      onCommitMessageChange={setMessage}
      onGenerate={vi.fn()}
      onCancelGenerate={vi.fn()}
      onFixCommitFailureWithAI={vi.fn()}
      onFixPushFailureWithAI={vi.fn()}
      onPrimaryAction={vi.fn()}
      onDropdownAction={vi.fn()}
    />
  )
}

async function setup(initial?: string): Promise<HTMLTextAreaElement> {
  const { getByLabelText } = render(<Harness initial={initial} />)
  const textarea = getByLabelText('Commit message')
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error('commit message field is not a textarea')
  }
  await act(async () => {
    textarea.focus()
    fireEvent.focus(textarea)
  })
  return textarea
}

async function press(textarea: HTMLTextAreaElement, key: 'ArrowUp' | 'ArrowDown', init = {}) {
  await act(async () => {
    fireEvent.keyDown(textarea, { key, ...init })
  })
}

beforeEach(() => {
  getRuntimeGitHistory.mockReset()
  getRuntimeGitHistory.mockResolvedValue({
    items: [item('feat: newest'), item('fix: middle\n\nbody'), item('chore: oldest')],
    hasIncomingChanges: false,
    hasOutgoingChanges: false,
    hasMore: false,
    limit: 50
  })
})

afterEach(() => {
  cleanup()
})

describe('commit message history recall', () => {
  it('fetches the worktree HEAD history on focus', async () => {
    await setup()
    expect(getRuntimeGitHistory).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: 'wt-1', worktreePath: '/repo' }),
      { limit: 50, baseRef: null }
    )
  })

  it('cycles older with Up and restores the draft with Down', async () => {
    const textarea = await setup('wip')
    textarea.setSelectionRange(0, 0)
    await press(textarea, 'ArrowUp')
    expect(textarea.value).toBe('feat: newest')
    await press(textarea, 'ArrowUp')
    expect(textarea.value).toBe('fix: middle\n\nbody')
    expect(textarea.selectionStart).toBe(0)
    await press(textarea, 'ArrowDown')
    // Why: caret lands at the start after Up, so Down inside a multi-line message moves natively first.
    expect(textarea.value).toBe('fix: middle\n\nbody')
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    await press(textarea, 'ArrowDown')
    expect(textarea.value).toBe('feat: newest')
    await press(textarea, 'ArrowDown')
    expect(textarea.value).toBe('wip')
  })

  it('keeps native caret movement when not on the first line', async () => {
    const textarea = await setup('line one\nline two')
    textarea.setSelectionRange(12, 12)
    await press(textarea, 'ArrowUp')
    expect(textarea.value).toBe('line one\nline two')
  })

  it('ignores modified arrows and IME composition', async () => {
    const textarea = await setup('')
    await press(textarea, 'ArrowUp', { shiftKey: true })
    await press(textarea, 'ArrowUp', { isComposing: true })
    expect(textarea.value).toBe('')
  })

  it('starts a new session after the user edits a recalled message', async () => {
    const textarea = await setup('')
    await press(textarea, 'ArrowUp')
    expect(textarea.value).toBe('feat: newest')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'feat: edited' } })
    })
    textarea.setSelectionRange(0, 0)
    await press(textarea, 'ArrowUp')
    expect(textarea.value).toBe('feat: newest')
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    await press(textarea, 'ArrowDown')
    expect(textarea.value).toBe('feat: edited')
  })
})
