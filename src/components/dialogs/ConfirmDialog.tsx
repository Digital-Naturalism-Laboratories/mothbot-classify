'use client'
import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { atom } from 'nanostores'
import type { ButtonVariant } from '~/components/ui/button'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent } from '~/components/ui/dialog'
import { Row } from '~/styles'

export type ConfirmDialogProps = {
  content: any
  confirmText: string
  onCancel?: () => void
  onConfirm: () => void
  cancelText?: string
  confirmVariant?: ButtonVariant
  cancelVariant?: ButtonVariant
  closeAfterConfirm?: boolean
}

export const atomConfirmDialogData = atom<ConfirmDialogProps | null>(null)

export function ConfirmDialog() {
  const { confirming, setConfirming, confirmDialogData, closeConfirmDialog } = useConfirmDialog()

  const [open, setOpen] = useState(false)

  async function onClickConfirmAction() {
    setConfirming(true)
    try {
      await Promise.resolve(confirmDialogData?.onConfirm())
    } finally {
      if (confirmDialogData?.closeAfterConfirm) closeConfirmDialog()
    }
  }

  function onClickCancel() {
    if (confirmDialogData?.onCancel) confirmDialogData.onCancel()
    else closeConfirmDialog()
  }

  useEffect(() => {
    setOpen(!!confirmDialogData)
  }, [confirmDialogData])

  if (!open || !confirmDialogData) return null

  const { content, confirmText, confirmVariant = 'primary', cancelVariant = 'secondary', cancelText } = confirmDialogData

  function onOpenChange(open: boolean) {
    setOpen(open)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={closeConfirmDialog} className='!w-auto !max-w-[600px]'>
        <div className='pr-12 text-16 font-medium'>{content}</div>
        <Row className='mt-12 justify-between space-x-20'>
          <Button variant={cancelVariant} onClick={onClickCancel}>
            {cancelText || 'Cancel'}
          </Button>

          <Button variant={confirmVariant} submitting={confirming} onClick={onClickConfirmAction}>
            {confirmText || 'Confirm'}
          </Button>
        </Row>
      </DialogContent>
    </Dialog>
  )
}

export function useConfirmDialog() {
  const [confirming, setConfirming] = useState<boolean>(false)
  const confirmDialogData = useStore(atomConfirmDialogData)

  useEffect(() => {
    setConfirming(false)
  }, [confirmDialogData])

  return {
    confirming,
    confirmDialogData,
    setConfirming,
    setConfirmDialog: (confirmDialog: ConfirmDialogProps) => {
      atomConfirmDialogData.set(confirmDialog)
    },
    closeConfirmDialog: () => {
      atomConfirmDialogData.set(null)
    },
  }
}
