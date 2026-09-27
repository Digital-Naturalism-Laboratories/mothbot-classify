import { useState } from 'react'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'

/**
 * Router-wide error screen (replaces TanStack's bare "Something went wrong!").
 * Renders inside the root layout for route errors, so the nav stays usable,
 * and gives the user a way out plus details worth pasting into a bug report.
 */
export function AppErrorScreen(props: ErrorComponentProps) {
  const { error } = props
  const [copied, setCopied] = useState(false)
  const message = error instanceof Error ? error.message : String(error)
  const looksLikeSizeLimit = /call stack|out of memory|allocation failed|invalid array length|invalid string length/i.test(message)

  async function copyDetails() {
    const details = [
      `Classify error: ${message}`,
      `Page: ${window.location.href}`,
      `Browser: ${navigator.userAgent}`,
      error instanceof Error && error.stack ? `\n${error.stack}` : '',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(details)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className='mx-auto max-w-[640px] px-20 py-40'>
      <h2 className='text-18 font-semibold text-ink-primary mb-8'>Classify hit an error</h2>
      <pre className='whitespace-pre-wrap break-words rounded-md border border-red-300 bg-red-50 p-12 text-12 text-red-700 mb-12'>{message}</pre>
      {looksLikeSizeLimit ? (
        <p className='text-13 text-neutral-700 mb-12'>
          This usually means something was too large for the browser to handle at once, like a night with an
          unusually high number of detections. Your saved IDs are safe. Reloading and opening a different night, or a
          smaller part of this one, should work.
        </p>
      ) : (
        <p className='text-13 text-neutral-700 mb-12'>Your saved IDs are safe. Reloading usually gets you going again.</p>
      )}
      <div className='flex flex-wrap gap-8'>
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <Button variant='outline' onClick={() => window.location.assign('/')}>
          Back to datasets
        </Button>
        <Button variant='outline' onClick={() => void copyDetails()}>
          {copied ? 'Copied' : 'Copy error details'}
        </Button>
      </div>
    </div>
  )
}
