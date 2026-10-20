import { dirname } from '@/lib/path'

function isSameOrDescendant(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`) || path.startsWith(`${ancestor}\\`)
}

/** Returns the dragged paths that a drop into `destDir` would actually move. */
export function planFileExplorerMoveDrop(
  sourcePaths: readonly string[],
  destDir: string
): string[] {
  return sourcePaths.filter(
    (sourcePath) => dirname(sourcePath) !== destDir && !isSameOrDescendant(destDir, sourcePath)
  )
}
