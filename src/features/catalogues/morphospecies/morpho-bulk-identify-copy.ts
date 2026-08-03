type MorphoBulkIdentifyCopyParams = {
  count: number
  leafGroupCount: number
  projectCount: number
}

export function buildMorphoBulkIdentifyConfirmText(params: MorphoBulkIdentifyCopyParams) {
  const { count, leafGroupCount, projectCount } = params

  return `Update ${count} instance${count !== 1 ? 's' : ''} across ${leafGroupCount} leaf group${leafGroupCount !== 1 ? 's' : ''} in ${projectCount} dataset${projectCount !== 1 ? 's' : ''}?`
}

export function buildMorphoBulkIdentifySuccessText(params: MorphoBulkIdentifyCopyParams) {
  const { count, leafGroupCount, projectCount } = params

  return `✅ Updated ${count} instance${count !== 1 ? 's' : ''} across ${leafGroupCount} leaf group${leafGroupCount !== 1 ? 's' : ''} in ${projectCount} dataset${projectCount !== 1 ? 's' : ''}`
}
