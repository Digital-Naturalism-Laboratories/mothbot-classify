import { useState } from 'react'
import { DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Loader } from '~/components/atomic/Loader'
import { closeGlobalDialog, openGlobalDialog } from '~/components/dialogs/global-dialog'
import { useSetupDatasetsFolderMutation } from './files-queries'
import { isDirectoryPickerLikelySupported, pickDirectoryHandle } from './directory-picker'

export type ChooseDatasetsFolderDialogProps = {
  onDismiss?: () => void
}

export function openChooseDatasetsFolderDialog(params?: ChooseDatasetsFolderDialogProps) {
  openGlobalDialog({
    component: ChooseDatasetsFolderDialogContent,
    props: params,
    onClose: params?.onDismiss,
    align: 'center',
    className: 'max-w-[440px]',
  })
}

export function ChooseDatasetsFolderDialogContent(props: ChooseDatasetsFolderDialogProps) {
  const { onDismiss } = props
  const chooseMutation = useSetupDatasetsFolderMutation()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const canPick = isDirectoryPickerLikelySupported()
  const isChoosing = chooseMutation.isPending

  function dismiss() {
    onDismiss?.()
    closeGlobalDialog()
  }

  async function onChooseFolder() {
    if (isChoosing || !canPick) return
    setErrorMessage(null)

    try {
      const handle = await pickDirectoryHandle({ mode: 'readwrite', title: 'projects folder' })
      if (!handle) return
      const ok = await chooseMutation.mutateAsync(handle)
      if (ok) closeGlobalDialog()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setErrorMessage(message)
    }
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>Choose projects folder</DialogTitle>
      </DialogHeader>

      <p className='mt-12 text-13 text-neutral-700 text-pretty'>
        Pick a <span className='font-medium text-neutral-900'>project folder</span> to open it, or a folder holding
        several projects to choose between them.
      </p>
      <p className='mt-8 text-13 text-neutral-600 text-pretty'>
        A project folder is one Mothbot Process worked on: it holds a{' '}
        <code className='text-12 text-neutral-800'>_processed</code> folder. A project&apos;s{' '}
        <code className='text-12 text-neutral-800'>_processed</code> folder on its own (for example, one shared with you)
        opens too.
      </p>

      {!canPick ? (
        <p className='mt-12 text-13 text-amber-800 text-pretty'>
          Folder picking is not available in this browser. Use Chrome, Edge, or Firefox on desktop.
        </p>
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
        <Button variant='outline' type='button' disabled={isChoosing} onClick={dismiss}>
          Not now
        </Button>
        <Button type='button' variant='primary' disabled={isChoosing || !canPick} onClick={() => void onChooseFolder()}>
          {isChoosing ? (
            <span className='inline-flex items-center gap-6'>
              <Loader size={14} />
              Choosing…
            </span>
          ) : (
            'Choose folder'
          )}
        </Button>
      </DialogFooter>
    </div>
  )
}
