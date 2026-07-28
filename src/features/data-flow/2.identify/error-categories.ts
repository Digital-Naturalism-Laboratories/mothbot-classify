import { atom } from 'nanostores'

/**
 * Error sub-categories. A detection can be marked as a generic error, or as a
 * more specific kind (Frass, Blur, …). The kind is carried in the detection
 * label using the Mothbox convention `ERROR_<reason>` (generic = `ERROR`).
 */

export const STANDARD_ERROR_REASONS = ['Frass', 'Blur'] as const

const CUSTOM_ERROR_REASONS_KEY = 'mbl/customErrorReasons'

function loadCustomReasons(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_ERROR_REASONS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** User-created error sub-categories, persisted in localStorage. */
export const customErrorReasonsStore = atom<string[]>(loadCustomReasons())

function isKnownReason(reason: string): boolean {
  const r = reason.toLowerCase()
  return (
    STANDARD_ERROR_REASONS.some((x) => x.toLowerCase() === r) ||
    customErrorReasonsStore.get().some((x) => x.toLowerCase() === r)
  )
}

/** Add a custom error sub-category (no-op if blank or already known). */
export function addCustomErrorReason(reason: string): void {
  const r = reason.trim()
  if (!r || isKnownReason(r)) return
  const next = [...customErrorReasonsStore.get(), r]
  customErrorReasonsStore.set(next)
  try {
    localStorage.setItem(CUSTOM_ERROR_REASONS_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota/availability errors */
  }
}

/** All error sub-categories (standard first, then custom). */
export function allErrorReasons(): string[] {
  return [...STANDARD_ERROR_REASONS, ...customErrorReasonsStore.get()]
}

/** Detection label for an error reason (generic when reason is empty). */
export function errorLabelForReason(reason?: string): string {
  const r = (reason ?? '').trim()
  return r ? `ERROR_${r}` : 'ERROR'
}

/** True if a label denotes an error (generic or a sub-category). */
export function isErrorLabel(label: string): boolean {
  const u = label.trim().toUpperCase()
  return u === 'ERROR' || u.startsWith('ERROR_') || u.startsWith('ERROR:')
}

/** Extract the sub-category from an error label, or null for a generic error. */
export function reasonFromErrorLabel(label: string): string | null {
  const m = /^ERROR[_:]\s*(.+)$/i.exec(label.trim())
  return m ? m[1]!.trim() : null
}
