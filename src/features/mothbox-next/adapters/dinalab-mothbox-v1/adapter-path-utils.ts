export function joinRelative(...segments: string[]): string {
  return segments
    .filter((s) => s.length > 0)
    .join('/')
    .replaceAll('\\', '/')
}

export function dirnameRelative(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

export function basenameRelative(filePath: string) {
  const parts = filePath.replaceAll('\\', '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? filePath
}
