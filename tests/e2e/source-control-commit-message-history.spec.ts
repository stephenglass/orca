import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { openSourceControlForWorktree } from './helpers/worktree-registration'

const OLDER_MESSAGE = 'chore: e2e older commit'
const NEWER_MESSAGE = 'feat: e2e newer commit\n\nBody line.'

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' })
}

function createWorktreeWithHistory(repoPath: string): { branchName: string; worktreePath: string } {
  const branchName = `e2e-commit-history-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const worktreePath = path.join(os.tmpdir(), branchName)
  git(repoPath, ['worktree', 'add', worktreePath, '-b', branchName])
  for (const [file, message] of [
    ['older.txt', OLDER_MESSAGE],
    ['newer.txt', NEWER_MESSAGE]
  ]) {
    writeFileSync(path.join(worktreePath, file), `${file}\n`)
    git(worktreePath, ['add', file])
    git(worktreePath, ['commit', '-m', message])
  }
  writeFileSync(path.join(worktreePath, 'staged.txt'), 'staged\n')
  git(worktreePath, ['add', 'staged.txt'])
  return { branchName, worktreePath }
}

function cleanupWorktree(repoPath: string, worktreePath: string, branchName: string): void {
  try {
    git(repoPath, ['worktree', 'remove', '--force', worktreePath])
  } catch {
    rmSync(worktreePath, { recursive: true, force: true })
    try {
      git(repoPath, ['worktree', 'prune'])
    } catch {
      // Best effort: the branch delete below is still worth attempting.
    }
  }
  try {
    git(repoPath, ['branch', '-D', branchName])
  } catch {
    // The branch may already be gone when git prunes it with the worktree.
  }
}

test.describe('Source Control commit message history', () => {
  test('Up and Down cycle through the branch commit messages', async ({
    orcaPage,
    testRepoPath
  }, testInfo) => {
    const worktree = createWorktreeWithHistory(testRepoPath)
    try {
      await waitForSessionReady(orcaPage)
      await openSourceControlForWorktree(orcaPage, testRepoPath, worktree.worktreePath)

      const textarea = orcaPage.getByRole('textbox', { name: 'Commit message' })
      await expect(textarea).toBeVisible({ timeout: 10_000 })
      await textarea.fill('wip draft')
      await textarea.press('Home')

      await textarea.press('ArrowUp')
      await expect(textarea).toHaveValue(NEWER_MESSAGE)
      // Why: Up leaves the caret on line 1, so Down walks the multi-line message natively first.
      await textarea.press('ArrowDown')
      await textarea.press('ArrowDown')
      await expect(textarea).toHaveValue(NEWER_MESSAGE)
      await textarea.press('ArrowDown')
      await expect(textarea).toHaveValue('wip draft')

      await textarea.press('Home')
      await textarea.press('ArrowUp')
      await expect(textarea).toHaveValue(NEWER_MESSAGE)
      await textarea.press('ArrowUp')
      await expect(textarea).toHaveValue(OLDER_MESSAGE)
      await textarea.screenshot({ path: testInfo.outputPath('commit-message-history.png') })
      await textarea.press('ArrowDown')
      await expect(textarea).toHaveValue(NEWER_MESSAGE)
    } finally {
      cleanupWorktree(testRepoPath, worktree.worktreePath, worktree.branchName)
    }
  })
})
