import { useId, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import type { FileExplorerMoveConfirmRequest } from './useFileExplorerMoveDrop'

// Matches VS Code's cap on names listed in a multi-item move prompt.
const MAX_LISTED_NAMES = 10

type FileExplorerMoveConfirmDialogProps = {
  request: FileExplorerMoveConfirmRequest | null
  onConfirm: (dontAskAgain: boolean) => void
  onCancel: () => void
}

/** Asks before a drag-and-drop move in the Explorer, like VS Code's explorer.confirmDragAndDrop. */
export function FileExplorerMoveConfirmDialog({
  request,
  onConfirm,
  onCancel
}: FileExplorerMoveConfirmDialogProps): React.JSX.Element {
  const checkboxId = useId()
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const [previousRequest, setPreviousRequest] = useState(request)

  // Why: each drop is a new confirmation, so reset the checkbox before paint.
  if (request !== previousRequest) {
    setPreviousRequest(request)
    if (request !== null) {
      setDontAskAgain(false)
    }
  }

  const names = request?.sourcePaths.map((path) => basename(path)) ?? []
  const target = request ? basename(request.destDir) : ''
  const isMulti = names.length > 1
  const hiddenCount = names.length - MAX_LISTED_NAMES

  const title = isMulti
    ? translate(
        'auto.components.right.sidebar.FileExplorerMoveConfirmDialog.move_several',
        "Are you sure you want to move the following {{fileCount}} files into '{{target}}'?",
        { fileCount: names.length, target }
      )
    : translate(
        'auto.components.right.sidebar.FileExplorerMoveConfirmDialog.move_single',
        "Are you sure you want to move '{{name}}' into '{{target}}'?",
        { name: names[0] ?? '', target }
      )

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onCancel()
        }
      }}
    >
      <DialogContent
        className="max-w-sm"
        showCloseButton={false}
        {...(isMulti ? {} : { 'aria-describedby': undefined })}
      >
        <DialogHeader>
          <DialogTitle className="break-words">{title}</DialogTitle>
          {isMulti ? (
            <DialogDescription asChild>
              <ul className="text-xs">
                {names.slice(0, MAX_LISTED_NAMES).map((name, index) => (
                  <li key={`${index}:${name}`} className="truncate" title={name}>
                    {name}
                  </li>
                ))}
                {hiddenCount > 0 ? (
                  <li>
                    {hiddenCount === 1
                      ? translate(
                          'auto.components.right.sidebar.FileExplorerMoveConfirmDialog.hidden_single',
                          '...1 additional file not shown'
                        )
                      : translate(
                          'auto.components.right.sidebar.FileExplorerMoveConfirmDialog.hidden_several',
                          '...{{hiddenCount}} additional files not shown',
                          { hiddenCount }
                        )}
                  </li>
                ) : null}
              </ul>
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Checkbox
            id={checkboxId}
            checked={dontAskAgain}
            onCheckedChange={(checked) => setDontAskAgain(checked === true)}
          />
          <Label htmlFor={checkboxId}>
            {translate(
              'auto.components.right.sidebar.FileExplorerMoveConfirmDialog.dont_ask_again',
              'Do not ask me again'
            )}
          </Label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {translate(
              'auto.components.right.sidebar.FileExplorerMoveConfirmDialog.cancel',
              'Cancel'
            )}
          </Button>
          <Button type="button" size="sm" autoFocus onClick={() => onConfirm(dontAskAgain)}>
            {translate('auto.components.right.sidebar.FileExplorerMoveConfirmDialog.move', 'Move')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
