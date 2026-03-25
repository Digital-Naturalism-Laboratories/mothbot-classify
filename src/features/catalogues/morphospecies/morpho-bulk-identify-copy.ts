type MorphoBulkIdentifyCopyParams = {
  count: number
  nightCount: number
  projectCount: number
}

export function buildMorphoBulkIdentifyConfirmText(params: MorphoBulkIdentifyCopyParams) {
  const { count, nightCount, projectCount } = params

  return `Update ${count} instance${count !== 1 ? 's' : ''} across ${nightCount} night${nightCount !== 1 ? 's' : ''} in ${projectCount} project${projectCount !== 1 ? 's' : ''}?`
}

export function buildMorphoBulkIdentifySuccessText(params: MorphoBulkIdentifyCopyParams) {
  const { count, nightCount, projectCount } = params

  return `✅ Updated ${count} instance${count !== 1 ? 's' : ''} across ${nightCount} night${nightCount !== 1 ? 's' : ''} in ${projectCount} project${projectCount !== 1 ? 's' : ''}`
}
