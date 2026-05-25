import { useState } from 'react'
import { DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Loader } from '~/components/atomic/Loader'
import { closeGlobalDialog, openGlobalDialog } from '~/components/dialogs/global-dialog'
import type { ForeignFolderCandidate } from './package-foreign-folders'
import { buildForeignContentDialogCopy } from './foreign-content-dialog-copy'
import { runForeignContentMerge } from './run-foreign-content-merge'

export type NewForeignContentDialogProps = {
  packageFolderName: string
  foreignFolders: ForeignFolderCandidate[]
  photosOnly: ForeignFolderCandidate[]
}

export function openNewForeignContentDialog(params: NewForeignContentDialogProps) {
  openGlobalDialog({
    component: NewForeignContentDialogContent,
    props: params,
    align: 'center',
    className: 'max-w-[420px]',
  })
}

export function NewForeignContentDialogContent(props: NewForeignContentDialogProps) {
  const { packageFolderName, foreignFolders, photosOnly } = props
  const [isMerging, setIsMerging] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const copy = buildForeignContentDialogCopy({ packageFolderName, foreignFolders, photosOnly })

  async function onConfirm() {
    if (isMerging) return
    setErrorMessage(null)
    setIsMerging(true)

    try {
      await runForeignContentMerge({ packageFolderName, foreignFolders })
      closeGlobalDialog()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setErrorMessage(message)
    } finally {
      setIsMerging(false)
    }
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
      </DialogHeader>

      <p className='mt-12 text-13 text-neutral-700 text-pretty'>{copy.lead}</p>

      {copy.photosOnlyNote ? (
        <p className='mt-8 text-12 text-neutral-500 text-pretty'>{copy.photosOnlyNote}</p>
      ) : null}

      {errorMessage ? (
        <div
          role='alert'
          className='mt-12 rounded-md border border-red-200 bg-red-50 px-12 py-10 text-13 text-red-800 whitespace-pre-wrap'
        >
          {errorMessage}
        </div>
      ) : null}

      <DialogFooter className='mt-20'>
        <Button variant='outline' type='button' disabled={isMerging} onClick={closeGlobalDialog}>
          Not now
        </Button>
        <Button type='button' variant='primary' disabled={isMerging} onClick={() => void onConfirm()}>
          {isMerging ? (
            <span className='inline-flex items-center gap-6'>
              <Loader size={14} />
              Adding…
            </span>
          ) : (
            'Add'
          )}
        </Button>
      </DialogFooter>
    </div>
  )
}
