import { useEffect, useState } from 'react'

type HandleLike = { getFile?: () => Promise<File> }

export function useObjectUrl(fileOrHandle?: File | null, handle?: HandleLike | unknown) {
  const [url, setUrl] = useState<string>('')

  useEffect(() => {
    let revoke: (() => void) | undefined

    if (fileOrHandle instanceof File) {
      const objectUrl = URL.createObjectURL(fileOrHandle)
      setUrl(objectUrl)
      revoke = () => URL.revokeObjectURL(objectUrl)
      return revoke
    }

    const h = handle as HandleLike | undefined
    if (h && typeof h?.getFile === 'function') {
      let cancelled = false
      void h.getFile().then((file) => {
        if (cancelled || !file) return
        const objectUrl = URL.createObjectURL(file)
        setUrl(objectUrl)
        revoke = () => URL.revokeObjectURL(objectUrl)
      }).catch(() => {})
      return () => {
        cancelled = true
        revoke?.()
      }
    }

    setUrl('')
  }, [fileOrHandle, handle])

  return url
}
