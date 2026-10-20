import { describe, expect, it } from 'vitest'
import { planFileExplorerMoveDrop } from './file-explorer-move-drop-plan'

describe('planFileExplorerMoveDrop', () => {
  it('keeps a path moving into a different folder', () => {
    expect(planFileExplorerMoveDrop(['/repo/a.ts'], '/repo/src')).toEqual(['/repo/a.ts'])
  })

  it('skips a drop into the folder the path is already in', () => {
    expect(planFileExplorerMoveDrop(['/repo/src/a.ts'], '/repo/src')).toEqual([])
  })

  it('skips a folder dropped into itself or its own child', () => {
    expect(planFileExplorerMoveDrop(['/repo/src'], '/repo/src')).toEqual([])
    expect(planFileExplorerMoveDrop(['/repo/src'], '/repo/src/lib')).toEqual([])
    expect(planFileExplorerMoveDrop(['C:\\repo\\src'], 'C:\\repo\\src\\lib')).toEqual([])
  })

  it('does not treat a sibling with a shared prefix as a child', () => {
    expect(planFileExplorerMoveDrop(['/repo/src'], '/repo/src-old')).toEqual(['/repo/src'])
  })

  it('keeps only the moving paths of a mixed batch', () => {
    expect(
      planFileExplorerMoveDrop(['/repo/src/a.ts', '/repo/b.ts', '/repo/src'], '/repo/src')
    ).toEqual(['/repo/b.ts'])
  })
})
