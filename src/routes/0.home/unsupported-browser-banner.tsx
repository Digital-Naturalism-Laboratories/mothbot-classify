import { useState } from 'react'
import { toast } from 'sonner'
import { isDirectoryPickerAvailable } from '~/features/data-flow/1.ingest/directory-picker'

/**
 * Classify reads datasets straight off disk via the File System Access API
 * (`showDirectoryPicker`), which only Chromium-based browsers implement. In
 * Firefox or Safari the app loads but can never open a folder, which otherwise
 * just looks broken — so say so up front, before the user hunts for the button.
 */
export function UnsupportedBrowserBanner() {
  const [supported] = useState(() => isDirectoryPickerAvailable())
  const [copied, setCopied] = useState(false)
  if (supported) return null

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      toast.success('Link copied — paste it into Chrome or Edge')
    } catch {
      toast.error('Could not copy — copy the address from the address bar instead.')
    }
  }

  return (
    <div className='mb-12 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 text-pretty'>
      <b>This browser can’t open dataset folders.</b> Classify needs the File System Access API, which
      only Chrome, Edge, and other Chromium-based browsers support (Firefox and Safari don’t). Open
      this page in Chrome to load your data.{' '}
      <button type='button' onClick={() => void copyLink()} className='underline underline-offset-2 font-medium'>
        {copied ? 'Link copied' : 'Copy this link'}
      </button>
    </div>
  )
}
