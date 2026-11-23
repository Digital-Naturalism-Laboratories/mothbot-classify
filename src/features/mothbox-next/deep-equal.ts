/** Structural equality for JSON values (objects compared by keys, arrays by order). */
export function isDeepStrictEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const other = b as unknown[]
    if (a.length !== other.length) return false
    for (let i = 0; i < a.length; i++) if (!isDeepStrictEqual(a[i], other[i])) return false
    return true
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const aKeys = Object.keys(ao).filter((k) => ao[k] !== undefined)
  const bKeys = Object.keys(bo).filter((k) => bo[k] !== undefined)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bo, key)) return false
    if (!isDeepStrictEqual(ao[key], bo[key])) return false
  }
  return true
}
