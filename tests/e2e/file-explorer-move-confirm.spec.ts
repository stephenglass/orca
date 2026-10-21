import { existsSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Locator, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { explorerRowByName, openFileExplorer } from './helpers/file-explorer'
import { getActiveWorktreePath, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

const PROOF_FILE = 'move-confirm-proof.txt'

// Why: hidden windows get no OS drag session, so replay the DOM drag events with one shared DataTransfer.
async function dragRowOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  await source.dispatchEvent('dragstart', { dataTransfer })
  await target.dispatchEvent('dragenter', { dataTransfer })
  await target.dispatchEvent('dragover', { dataTransfer })
  await target.dispatchEvent('drop', { dataTransfer })
  await source.dispatchEvent('dragend', { dataTransfer })
}

test('dragging a file onto a folder asks before moving it', async ({ orcaPage }, testInfo) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  const rootPath = await getActiveWorktreePath(orcaPage)
  const sourceFile = path.join(rootPath, PROOF_FILE)
  const movedFile = path.join(rootPath, 'src', PROOF_FILE)
  writeFileSync(sourceFile, 'drag me\n')

  try {
    await openFileExplorer(orcaPage)
    await expect(explorerRowByName(orcaPage, PROOF_FILE)).toBeVisible({ timeout: 15_000 })
    const dialog = orcaPage.getByRole('dialog')

    // Cancel leaves the file where it was.
    await dragRowOnto(
      orcaPage,
      explorerRowByName(orcaPage, PROOF_FILE),
      explorerRowByName(orcaPage, 'src')
    )
    await expect(dialog).toContainText(`Are you sure you want to move '${PROOF_FILE}' into 'src'?`)
    await expect(dialog).toContainText('Do not ask me again')
    await orcaPage.screenshot({ path: testInfo.outputPath('01-confirm-dialog.png') })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    expect(existsSync(sourceFile)).toBe(true)
    expect(existsSync(movedFile)).toBe(false)

    // Move with "Do not ask me again" moves the file and turns the setting off.
    await dragRowOnto(
      orcaPage,
      explorerRowByName(orcaPage, PROOF_FILE),
      explorerRowByName(orcaPage, 'src')
    )
    await dialog.getByRole('checkbox').click()
    await orcaPage.screenshot({ path: testInfo.outputPath('02-dont-ask-again-checked.png') })
    await dialog.getByRole('button', { name: 'Move' }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => existsSync(movedFile), { timeout: 10_000 }).toBe(true)
    expect(existsSync(sourceFile)).toBe(false)
    await expect
      .poll(() =>
        orcaPage.evaluate(() => window.__store!.getState().settings?.confirmExplorerDragAndDrop)
      )
      .toBe(false)
    await orcaPage.screenshot({ path: testInfo.outputPath('03-after-move.png') })
  } finally {
    rmSync(sourceFile, { force: true })
    rmSync(movedFile, { force: true })
  }
})
