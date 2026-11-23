/**
 * Non-Target labels (ontology: Non-Target).
 *
 * Non-Target is the top-level category for detections we aren't interested in, that are
 * too distorted to use, or that come from a detection error. Below it users build their
 * own hierarchy; Error and Abiotic are built in.
 *
 * A label is the path from Non-Target down, joined with "/":
 *   NON_TARGET                 just Non-Target
 *   NON_TARGET/Error           Non-Target › Error
 *   NON_TARGET/Error/Blur      Non-Target › Error › Blur
 *
 * Older Mothbox data used `ERROR` and `ERROR_<reason>`. Those are read as Non-Target
 * (see `normalizeNonTargetLabel`) and written in the new form from then on.
 */

export const NON_TARGET = 'NON_TARGET'
export const NON_TARGET_DISPLAY = 'Non-Target'
export const BUILT_IN_NON_TARGET_CATEGORIES = ['Error', 'Abiotic'] as const

const PATH_SEPARATOR = '/'
const DISPLAY_SEPARATOR = ' › '

/** Legacy `ERROR_<reason>` reasons that now sit under Error rather than directly under Non-Target. */
const LEGACY_REASONS_UNDER_ERROR = new Set(['blur'])

/** Label for a category path (`[]` or nothing → plain Non-Target). */
export function nonTargetLabel(path?: string | readonly string[]): string {
  const segments = typeof path === 'string' ? parseNonTargetPath(path) : cleanSegments(path ?? [])
  return segments.length ? [NON_TARGET, ...segments].join(PATH_SEPARATOR) : NON_TARGET
}

/**
 * Splits typed text into path segments. Accepts "/", ">" or "›" between levels, so
 * "Error > Glare" and "Error/Glare" both mean Non-Target › Error › Glare.
 */
export function parseNonTargetPath(text: string): string[] {
  return cleanSegments(text.split(/\s*[/>›]\s*/))
}

/** The display form ("Non-Target › Error › Blur", "non-target/plantae"); group 1 is the path. */
const DISPLAY_FORM = /^non[-_ ]?target(?:\s*[/>›]\s*(.*))?$/i

/** True for any Non-Target label: new (`NON_TARGET…`), display form (`Non-Target › …`) or legacy (`ERROR…`). */
export function isNonTargetLabel(label?: string | null): boolean {
  const trimmed = (label ?? '').trim()
  const upper = trimmed.toUpperCase()
  if (!upper) return false
  if (upper === NON_TARGET || upper.startsWith(`${NON_TARGET}${PATH_SEPARATOR}`)) return true
  if (DISPLAY_FORM.test(trimmed)) return true
  return upper === 'ERROR' || upper.startsWith('ERROR_') || upper.startsWith('ERROR:')
}

/**
 * The canonical Non-Target label for any Non-Target label, including legacy ones:
 *   ERROR → NON_TARGET
 *   ERROR_Blur → NON_TARGET/Error/Blur
 *   ERROR_Frass → NON_TARGET/Frass
 *   ERROR_<reason> → NON_TARGET/<reason>
 * Anything that isn't a Non-Target label becomes plain NON_TARGET.
 */
export function normalizeNonTargetLabel(label?: string | null): string {
  const trimmed = (label ?? '').trim()
  const upper = trimmed.toUpperCase()

  if (upper === NON_TARGET || upper.startsWith(`${NON_TARGET}${PATH_SEPARATOR}`)) {
    return nonTargetLabel(trimmed.slice(NON_TARGET.length + 1))
  }

  const display = DISPLAY_FORM.exec(trimmed)
  if (display) return nonTargetLabel(display[1] ?? '')

  const legacy = /^ERROR(?:[_:]\s*(.+))?$/i.exec(trimmed)
  if (legacy) {
    const reason = (legacy[1] ?? '').trim()
    if (!reason) return NON_TARGET
    if (reason.toLowerCase() === 'error') return nonTargetLabel(['Error'])
    if (LEGACY_REASONS_UNDER_ERROR.has(reason.toLowerCase())) return nonTargetLabel(['Error', reason])
    return nonTargetLabel(parseNonTargetPath(reason))
  }

  return NON_TARGET
}

/** The category path below Non-Target (`[]` for plain Non-Target). */
export function nonTargetPathOf(label?: string | null): string[] {
  const normalized = normalizeNonTargetLabel(label)
  return normalized === NON_TARGET ? [] : normalized.slice(NON_TARGET.length + 1).split(PATH_SEPARATOR)
}

/** "Non-Target › Error › Blur" for display. */
export function formatNonTargetLabel(label?: string | null): string {
  return [NON_TARGET_DISPLAY, ...nonTargetPathOf(label)].join(DISPLAY_SEPARATOR)
}

/** "Error › Blur" for a category path. */
export function formatNonTargetPath(path: readonly string[]): string {
  return path.join(DISPLAY_SEPARATOR)
}

/** A stable key for a category path, e.g. "Error/Blur". */
export function nonTargetPathKey(path: readonly string[]): string {
  return cleanSegments(path).join(PATH_SEPARATOR)
}

function cleanSegments(segments: readonly string[]): string[] {
  return segments.map((s) => s.trim()).filter(Boolean)
}
