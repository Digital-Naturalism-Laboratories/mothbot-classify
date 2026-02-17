import { useEffect, useRef } from 'react'

/**
 * Layout-aware hotkey hook that uses `event.key` (the produced character)
 * instead of `event.code` (the physical key position).
 *
 * This works correctly across keyboard layouts (AZERTY, QWERTY, Dvorak, etc.)
 * and properly checks modifier keys — unlike react-hotkeys-hook's `useKey` option
 * which has an open bug (#1316) skipping modifier checks.
 *
 * @param hotkey - e.g. 'a', 'shift+a', 'd', 'space'
 * @param callback - fired when the hotkey matches
 * @param deps - dependency array for the callback (like useCallback)
 */
export function useHotkey(hotkey: string, callback: (event: KeyboardEvent) => void, deps: unknown[] = []) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const parsed = useRef(parseHotkey(hotkey))

  useEffect(() => {
    parsed.current = parseHotkey(hotkey)
  }, [hotkey])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return
      if (event.key == null || event.key === '') return

      const spec = parsed.current
      const key = event.key === ' ' ? 'space' : event.key.toLowerCase()

      if (key !== spec.key) return
      if (spec.shift !== event.shiftKey) return
      if (spec.ctrl !== (event.ctrlKey || event.metaKey)) return
      if (spec.alt !== event.altKey) return

      event.preventDefault()
      callbackRef.current(event)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotkey, ...deps])
}

type ParsedHotkey = { key: string; shift: boolean; ctrl: boolean; alt: boolean }

function parseHotkey(hotkey: string): ParsedHotkey {
  const parts = hotkey.toLowerCase().split('+').map((p) => p.trim())

  const shift = parts.includes('shift')
  const ctrl = parts.includes('ctrl') || parts.includes('mod') || parts.includes('meta')
  const alt = parts.includes('alt')
  const key = parts.filter((p) => !['shift', 'ctrl', 'mod', 'meta', 'alt'].includes(p)).join('+')

  return { key, shift, ctrl, alt }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true

  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
