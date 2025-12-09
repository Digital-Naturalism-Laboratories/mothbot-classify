'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva } from 'class-variance-authority'
import * as React from 'react'

import { CloseButton } from '~/components/ui/close-button'
import { cn } from '~/utils/cn'

import { atom } from 'nanostores'

export const $isAnyDialogOpen = atom(false)

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = ({ ...props }: DialogPrimitive.DialogPortalProps) => <DialogPrimitive.Portal {...props} />
DialogPortal.displayName = DialogPrimitive.Portal.displayName

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const dialogContentVariants = cva(
  cn(
    'fixed left-[50%] z-50 grid w-full max-w-lg max-h-[90%] translate-x-[-50%]  gap-4 bg-background p-container shadow-dialog sm:rounded-xl md:w-full',
    'ring-1 ring-black/5',
    'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out ',
    'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ',
    'data-[state=closed]:zoom-out-[.98] data-[state=open]:zoom-in-[.98]',
    'data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2  ',
    'overflow-y-scroll overflow-x-hidden',
  ),
  {
    variants: {
      align: {
        center:
          'top-[50%] max-h-[85vh] translate-y-[-50%] data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]',
        top: 'top-[10vh]',
        max: 'top-[50%] max-h-[98vh] translate-y-[-50%] data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]',
        vhSide:
          'top-8 bottom-8 right-8 left-auto translate-x-0 h-[calc(100vh-16px)] max-h-[calc(100vh-16px)] w-[66.6667vw] max-w-none data-[state=closed]:slide-out-to-right-[10%] data-[state=open]:slide-in-from-right-[10%] data-[state=closed]:zoom-out-[1] data-[state=open]:zoom-in-[1]         ',
        full: cn(
          'w-full h-full max-w-[calc(100vw-40px)] max-h-[calc(100vh-40px)] inset-20',
          'translate-x-[0px] translate-y-[0px] data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]',
        ),
      },
    },
    defaultVariants: {
      align: 'center',
    },
  },
)

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  onClose?: any
  align?: 'center' | 'top' | 'max' | 'full' | 'vhSide'
  hideClose?: boolean
}
const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, onClose, align = 'center', hideClose, ...props }, ref) => {
    React.useEffect(() => {
      $isAnyDialogOpen.set(true)
      return () => {
        $isAnyDialogOpen.set(false)
      }
    }, [])

    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(dialogContentVariants({ align }), className)}
          onPointerDownOutside={onClose}
          onEscapeKeyDown={onClose}
          style={{ '--container-padding': '20px', '--container-padding-sm': '12px' } as any}
          {...props}
        >
          {children}

          {!hideClose === true && <DialogClose onClick={onClose} />}
        </DialogPrimitive.Content>
      </DialogPortal>
    )
  },
)
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogClose = ({ className, onClick, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
  <DialogPrimitive.Close asChild>
    <CloseButton {...rest} />
  </DialogPrimitive.Close>
)
DialogClose.displayName = 'DialogClose'

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col text-center sm:text-left', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-8', className)} {...props} />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-16 font-medium leading-none tracking-tight', className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger }

export const closeDialog = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
