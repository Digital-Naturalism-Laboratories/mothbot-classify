export function formatPendingDatasetSetupError(
  errors: Array<{ folderName: string; message: string }>,
): string | null {
  if (errors.length === 0) return null
  if (errors.length === 1) return errors[0].message
  return errors.map((item) => `• ${item.folderName}: ${item.message}`).join('\n')
}
