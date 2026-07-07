export function buildPendingDatasetSetupCopy(params: {
  count: number
  folderNames: string[]
}) {
  const { count, folderNames } = params
  const title = count === 1 ? `Set up "${folderNames[0]}"?` : `Set up ${count} new datasets?`

  if (count === 1) {
    return {
      title,
      lead: `"${folderNames[0]}" is in your datasets folder but is not ready to open yet.`,
      detail: 'Setup indexes detections and processed patches in place, then adds it to the sidebar.',
      confirmLabel: 'Set up',
    }
  }

  return {
    title,
    lead: `${count} folders in your datasets directory are not ready to open yet.`,
    detail: 'Setup indexes detections and processed patches in place, then adds them to the sidebar.',
    confirmLabel: 'Set up',
  }
}
