// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileExplorerMoveConfirmDialog } from './FileExplorerMoveConfirmDialog'
import type { FileExplorerMoveConfirmRequest } from './useFileExplorerMoveDrop'

const mountedRoots: Root[] = []

async function renderDialog(
  request: FileExplorerMoveConfirmRequest | null,
  onConfirm = vi.fn(),
  onCancel = vi.fn()
): Promise<{ root: Root; onConfirm: typeof onConfirm; onCancel: typeof onCancel }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push(root)
  await act(async () => {
    root.render(
      <FileExplorerMoveConfirmDialog request={request} onConfirm={onConfirm} onCancel={onCancel} />
    )
  })
  return { root, onConfirm, onCancel }
}

function getButton(label: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === label
  )
  if (!button) {
    throw new Error(`Button not found: ${label}`)
  }
  return button
}

function getCheckbox(): HTMLButtonElement {
  const checkbox = document.body.querySelector<HTMLButtonElement>('[role="checkbox"]')
  if (!checkbox) {
    throw new Error('Checkbox not found')
  }
  return checkbox
}

function request(sourcePaths: string[], destDir = '/repo/src'): FileExplorerMoveConfirmRequest {
  return { worktreeId: 'wt-1', sourcePaths, destDir }
}

describe('FileExplorerMoveConfirmDialog', () => {
  afterEach(async () => {
    await act(async () => {
      for (const root of mountedRoots.splice(0)) {
        root.unmount()
      }
    })
    document.body.innerHTML = ''
  })

  it('stays closed without a request', async () => {
    await renderDialog(null)
    expect(document.body.textContent).not.toContain('Are you sure')
  })

  it('asks about a single item by name and moves without changing the preference', async () => {
    const { onConfirm } = await renderDialog(request(['/repo/a.ts']))

    expect(document.body.textContent).toContain("Are you sure you want to move 'a.ts' into 'src'?")
    expect(document.body.textContent).toContain('Do not ask me again')

    await act(async () => {
      getButton('Move').click()
    })
    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  it('lists several items and cuts the list off after ten', async () => {
    const paths = Array.from({ length: 12 }, (_, index) => `/repo/file-${index}.ts`)
    await renderDialog(request(paths))

    expect(document.body.textContent).toContain(
      "Are you sure you want to move the following 12 files into 'src'?"
    )
    expect(document.body.textContent).toContain('file-9.ts')
    expect(document.body.textContent).not.toContain('file-10.ts')
    expect(document.body.textContent).toContain('...2 additional files not shown')
  })

  it('reports the checkbox when Move is pressed', async () => {
    const { onConfirm } = await renderDialog(request(['/repo/a.ts']))

    await act(async () => {
      getCheckbox().click()
    })
    await act(async () => {
      getButton('Move').click()
    })
    expect(onConfirm).toHaveBeenCalledWith(true)
  })

  it('cancels without moving and resets the checkbox for the next drop', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { root } = await renderDialog(request(['/repo/a.ts']), onConfirm, onCancel)

    await act(async () => {
      getCheckbox().click()
    })
    await act(async () => {
      getButton('Cancel').click()
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()

    await act(async () => {
      root.render(
        <FileExplorerMoveConfirmDialog
          request={request(['/repo/b.ts'])}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })
    expect(getCheckbox().getAttribute('aria-checked')).toBe('false')
  })
})
