import { translate } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import type { ConfirmationDialogOptions } from '@/components/confirmation-dialog-context'

// Matches VS Code's cap on names listed in a multi-item move prompt.
const MAX_LISTED_NAMES = 10

/** VS Code's explorer.confirmDragAndDrop wording for moving `sourcePaths` into `destDir`. */
export function buildFileExplorerMoveConfirmOptions(
  sourcePaths: readonly string[],
  destDir: string
): ConfirmationDialogOptions {
  const names = sourcePaths.map((path) => basename(path))
  const target = basename(destDir)
  const base = {
    confirmLabel: translate('auto.components.right.sidebar.useFileExplorerMoveDrop.move', 'Move'),
    initialFocus: 'confirm',
    compact: true
  } satisfies Partial<ConfirmationDialogOptions>

  if (names.length === 1) {
    return {
      ...base,
      title: translate(
        'auto.components.right.sidebar.useFileExplorerMoveDrop.move_single',
        "Are you sure you want to move '{{name}}' into '{{target}}'?",
        { name: names[0], target }
      )
    }
  }

  const hiddenCount = names.length - MAX_LISTED_NAMES
  const lines = names.slice(0, MAX_LISTED_NAMES)
  if (hiddenCount === 1) {
    lines.push(
      translate(
        'auto.components.right.sidebar.useFileExplorerMoveDrop.hidden_single',
        '...1 additional file not shown'
      )
    )
  } else if (hiddenCount > 1) {
    lines.push(
      translate(
        'auto.components.right.sidebar.useFileExplorerMoveDrop.hidden_several',
        '...{{hiddenCount}} additional files not shown',
        { hiddenCount }
      )
    )
  }
  return {
    ...base,
    title: translate(
      'auto.components.right.sidebar.useFileExplorerMoveDrop.move_several',
      "Are you sure you want to move the following {{fileCount}} files into '{{target}}'?",
      { fileCount: names.length, target }
    ),
    description: lines.join('\n')
  }
}
