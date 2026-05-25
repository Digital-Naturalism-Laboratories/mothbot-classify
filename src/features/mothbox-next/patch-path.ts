export function extractPatchFilename(params: { patchPath: string }) {
  const { patchPath } = params
  if (!patchPath) return ''
  const normalized = patchPath.replaceAll('\\', '/').trim()
  const segments = normalized.split('/')
  return segments[segments.length - 1] ?? ''
}
