import { useEffect, useRef } from 'react'

const HOTKEY_DEBUG = true

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
      const spec = parsed.current
      const isEditable = isEditableTarget(event.target)
      const isMissingKey = event.key == null || event.key === ''
      const key = event.key === ' ' ? 'space' : event.key?.toLowerCase()
      const matchesKey = key === spec.key
      const effectiveShift = deriveShiftState(event)
      const matchesShift = spec.shift === effectiveShift
      const matchesCtrl = spec.ctrl === (event.ctrlKey || event.metaKey)
      const matchesAlt = spec.alt === event.altKey

      logHotkeyDebug({
        hotkey,
        event,
        spec,
        key,
        isEditable,
        isMissingKey,
        matchesKey,
        matchesShift,
        matchesCtrl,
        matchesAlt,
        effectiveShift,
      })

      if (isEditable) return
      if (isMissingKey) return

      if (!matchesKey) return
      if (!matchesShift) return
      if (!matchesCtrl) return
      if (!matchesAlt) return

      event.preventDefault()
      callbackRef.current(event)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotkey, ...deps])
}

type ParsedHotkey = { key: string; shift: boolean; ctrl: boolean; alt: boolean }

type HotkeyDebugParams = {
  hotkey: string
  event: KeyboardEvent
  spec: ParsedHotkey
  key?: string
  isEditable: boolean
  isMissingKey: boolean
  matchesKey: boolean
  matchesShift: boolean
  matchesCtrl: boolean
  matchesAlt: boolean
  effectiveShift: boolean
}

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

function deriveShiftState(event: KeyboardEvent) {
  const eventKey = event.key ?? ''
  const isSingleLetter = /^[a-zA-Z]$/.test(eventKey)

  if (isSingleLetter) return eventKey !== eventKey.toLowerCase()
  return event.shiftKey
}

function logHotkeyDebug(params: HotkeyDebugParams) {
  if (!HOTKEY_DEBUG) return

  const {
    hotkey,
    event,
    spec,
    key,
    isEditable,
    isMissingKey,
    matchesKey,
    matchesShift,
    matchesCtrl,
    matchesAlt,
    effectiveShift,
  } = params

  const target = event.target instanceof HTMLElement ? event.target.tagName : 'UNKNOWN'

  console.log('🧪 hotkey debug', {
    hotkey,
    eventKey: event.key,
    normalizedKey: key,
    code: event.code,
    shift: event.shiftKey,
    effectiveShift,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    target,
    isEditable,
    isMissingKey,
    spec,
    matchesKey,
    matchesShift,
    matchesCtrl,
    matchesAlt,
  })
}
