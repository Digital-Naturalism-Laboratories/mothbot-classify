import { Outlet } from '@tanstack/react-router'
import { Nav } from '~/components/nav'
import { CenteredLoader } from '~/components/atomic/CenteredLoader'
import { useAppLoading } from '~/features/data-flow/1.ingest/files-queries'
import { Toaster } from 'sonner'
import { UserInitialsDialog } from '~/components/user-initials-dialog'
import { ConfirmDialog } from '~/components/dialogs/ConfirmDialog'
import { GlobalDialog } from '~/components/dialogs/global-dialog'
import { TooltipProvider } from '~/components/ui/tooltip'
import { useDatasetsFolderFocusCheck } from '~/features/data-flow/1.ingest/use-datasets-folder-focus-check'

export function RootLayout() {
  const { isBlockingLoading } = useAppLoading()
  useDatasetsFolderFocusCheck()
  return (
    <TooltipProvider>
      <div className='min-h-screen max-h-screen flex flex-col overflow-hidden bg-neutral-50 text-neutral-900'>
        <Nav />

        <main className='flex flex-col flex-1 w-full h-full overflow-hidden'>
          {isBlockingLoading ? <CenteredLoader>🌀 Loading projects folder</CenteredLoader> : <Outlet />}
        </main>
        <Toaster />

        <UserInitialsDialog />
        <ConfirmDialog />
        <GlobalDialog />
      </div>
    </TooltipProvider>
  )
}
