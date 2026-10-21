import { dirname } from '@/lib/path'
import { isPathEqualOrDescendant } from './file-explorer-paths'

/** Returns the dragged paths that a drop into `destDir` would actually move. */
export function planFileExplorerMoveDrop(
  sourcePaths: readonly string[],
  destDir: string
): string[] {
  return sourcePaths.filter(
    (sourcePath) => dirname(sourcePath) !== destDir && !isPathEqualOrDescendant(destDir, sourcePath)
  )
}
