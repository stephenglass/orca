import { describe, expect, it } from 'vitest'
import { buildFileExplorerMoveConfirmOptions } from './file-explorer-move-confirm-prompt'

describe('buildFileExplorerMoveConfirmOptions', () => {
  it('names a single item and its target folder', () => {
    const options = buildFileExplorerMoveConfirmOptions(['/repo/a.ts'], '/repo/src')
    expect(options.title).toBe("Are you sure you want to move 'a.ts' into 'src'?")
    expect(options.description).toBeUndefined()
    expect(options.confirmLabel).toBe('Move')
    expect(options.initialFocus).toBe('confirm')
  })

  it('lists several items one per line', () => {
    const options = buildFileExplorerMoveConfirmOptions(['/repo/a.ts', '/repo/b'], '/repo/src')
    expect(options.title).toBe("Are you sure you want to move the following 2 files into 'src'?")
    expect(options.description).toBe('a.ts\nb')
  })

  it('cuts the list off after ten names', () => {
    const paths = Array.from({ length: 12 }, (_, index) => `/repo/file-${index}.ts`)
    const lines = buildFileExplorerMoveConfirmOptions(paths, '/repo/src').description?.split('\n')
    expect(lines).toHaveLength(11)
    expect(lines?.[9]).toBe('file-9.ts')
    expect(lines?.[10]).toBe('...2 additional files not shown')
  })

  it('uses the singular overflow line for one hidden item', () => {
    const paths = Array.from({ length: 11 }, (_, index) => `/repo/file-${index}.ts`)
    expect(buildFileExplorerMoveConfirmOptions(paths, '/repo/src').description).toContain(
      '...1 additional file not shown'
    )
  })
})
