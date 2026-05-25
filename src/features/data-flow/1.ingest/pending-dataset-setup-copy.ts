export function buildPendingDatasetSetupCopy(params: {
  count: number
  folderNames: string[]
  imageOnlyCount: number
  legacyCount: number
}) {
  const { count, folderNames, imageOnlyCount, legacyCount } = params
  const title = count === 1 ? `Set up “${folderNames[0]}”?` : `Set up ${count} new datasets?`

  if (count === 1 && imageOnlyCount === 1) {
    return {
      title,
      lead: `“${folderNames[0]}” contains patch images but no *_botdetection.json files.`,
      detail:
        'Each .jpg, .jpeg, or .png will be treated as a patch you can classify manually. Images stay in place; the app adds dataset.json and records.',
      confirmLabel: 'Set up as patch images',
    }
  }

  if (imageOnlyCount > 0 && legacyCount === 0) {
    return {
      title,
      lead: `${count} folders contain patch images only (no bot detection JSON).`,
      detail: 'Setup treats each image file as a patch. Images stay in place; the app adds dataset.json and records.',
      confirmLabel: 'Set up patch images',
    }
  }

  if (imageOnlyCount > 0 && legacyCount > 0) {
    return {
      title,
      lead: `${count} folders need setup (${imageOnlyCount} patch-image-only, ${legacyCount} with bot detection JSON).`,
      detail:
        'Patch-image folders index each image as a patch. Legacy folders index detections from *_botdetection.json.',
      confirmLabel: 'Set up',
    }
  }

  if (count === 1) {
    return {
      title,
      lead: `“${folderNames[0]}” is in your datasets folder but is not ready to open yet.`,
      detail: 'Setup indexes detections in place and adds it to the sidebar.',
      confirmLabel: 'Set up',
    }
  }

  return {
    title,
    lead: `${count} folders in your datasets directory are not ready to open yet.`,
    detail: 'Setup indexes detections in place and adds them to the sidebar.',
    confirmLabel: 'Set up',
  }
}
