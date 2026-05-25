import { atom } from 'nanostores'

export type IndexedFile = {
  file: File
  path: string
  name: string
  size: number
}

export type Dataset = {
  projects: Project[]
}

export type Project = {
  id: string
  name: string
  deployments: Deployment[]
}

export type Deployment = {
  id: string
  name: string
  nights: Night[]
}

export type Night = {
  id: string
  name: string
  photos: Photo[]
}

export type Photo = {
  id: string
  name: string
  baseName: string
  imageFile?: IndexedFile
  botDetectionFile?: IndexedFile
  patches: Patch[]
}

export type Patch = {
  id: string
  name: string
  imageFile: IndexedFile
}

export const datasetStore = atom<Dataset | null>(null)

export function updateDatasetFromFiles(params: { files: IndexedFile[] }) {
  const { files } = params
  const dataset = buildDatasetFromFiles({ files })
  datasetStore.set(dataset)
}

export function buildDatasetFromFiles(params: { files: IndexedFile[] }): Dataset | null {
  const { files } = params
  if (!files?.length) return null

  const grouped: Map<string, Project> = new Map()

  for (const f of files) {
    const segments = splitPath({ path: f?.path ?? '' })
    if (segments.length < 3) continue

    const [projectName, deploymentName, nightName, ...rest] = segments
    if (!projectName || !deploymentName || !nightName) continue

    const projectId = projectName
    const deploymentId = `${projectName}/${deploymentName}`
    const leafGroupId = `${deploymentId}/${nightName}`

    const project = getOrCreateProject({ grouped, projectId, projectName })
    const deployment = getOrCreateDeployment({ project, deploymentId, deploymentName })
    const night = getOrCreateNight({ deployment, leafGroupId, nightName })

    const isPatch = isPatchFile({ file: f })
    const isJson = isBotDetectionJson({ file: f })
    const isPhoto = isPhotoImage({ file: f })

    if (!isPatch && !isJson && !isPhoto) continue

    const baseName = getBaseNameForGrouping({ name: f.name })
    if (!baseName) continue

    const photo = getOrCreatePhoto({ night, baseName, name: f.name })

    if (isPhoto) photo.imageFile = f
    if (isJson) photo.botDetectionFile = f
    if (isPatch) {
      if (fileNameStartsWithBase({ fileName: f.name, baseName })) {
        const patch: Patch = { id: `${photo.id}/${f.name}`, name: f.name, imageFile: f }
        photo.patches.push(patch)
      }
    }
  }

  const projects = Array.from(grouped.values()).map(sortProject)
  const result: Dataset = { projects }
  return result
}

function getOrCreateProject(params: { grouped: Map<string, Project>; projectId: string; projectName: string }) {
  const { grouped, projectId, projectName } = params
  const existing = grouped.get(projectId)
  if (existing) return existing
  const created: Project = { id: projectId, name: projectName, deployments: [] }
  grouped.set(projectId, created)
  return created
}

function getOrCreateDeployment(params: { project: Project; deploymentId: string; deploymentName: string }) {
  const { project, deploymentId, deploymentName } = params
  const found = project.deployments.find((d) => d.id === deploymentId)
  if (found) return found
  const created: Deployment = { id: deploymentId, name: deploymentName, nights: [] }
  project.deployments.push(created)
  return created
}

function getOrCreateNight(params: { deployment: Deployment; leafGroupId: string; nightName: string }) {
  const { deployment, leafGroupId, nightName } = params
  const found = deployment.nights.find((n) => n.id === leafGroupId)
  if (found) return found
  const created: Night = { id: leafGroupId, name: nightName, photos: [] }
  deployment.nights.push(created)
  return created
}

function getOrCreatePhoto(params: { night: Night; baseName: string; name: string }) {
  const { night, baseName, name } = params
  const photoId = `${night.id}/${baseName}`
  const found = night.photos.find((p) => p.id === photoId)
  if (found) return found
  const created: Photo = { id: photoId, name, baseName, patches: [] }
  night.photos.push(created)
  return created
}

function isPatchFile(params: { file: IndexedFile }) {
  const { file } = params
  const isJpg = file?.name?.toLowerCase?.().endsWith('.jpg')
  const hasPatchesFolder = file?.path?.toLowerCase?.().includes('/patches/')
  if (!isJpg) return false
  if (!hasPatchesFolder) return false
  return true
}

function isPhotoImage(params: { file: IndexedFile }) {
  const { file } = params
  const isJpg = file?.name?.toLowerCase?.().endsWith('.jpg')
  const hasPatchesFolder = file?.path?.toLowerCase?.().includes('/patches/')
  if (!isJpg) return false
  if (hasPatchesFolder) return false
  return true
}

function isBotDetectionJson(params: { file: IndexedFile }) {
  const { file } = params
  const isJson = file?.name?.toLowerCase?.().endsWith('.json')
  const isBotDetection = file?.name?.toLowerCase?.().endsWith('_botdetection.json')
  if (!isJson) return false
  if (!isBotDetection) return false
  return true
}

function getBaseNameForGrouping(params: { name: string }) {
  const { name } = params
  if (!name) return ''
  if (name.toLowerCase().endsWith('_botdetection.json')) {
    const base = name.slice(0, -'_botdetection.json'.length)
    return base
  }
  if (name.toLowerCase().endsWith('.jpg')) {
    // For patches we don't use their basename; only root photo images should pass here
    const withoutExt = name.slice(0, -'.jpg'.length)
    return withoutExt
  }
  return ''
}

function fileNameStartsWithBase(params: { fileName: string; baseName: string }) {
  const { fileName, baseName } = params
  if (!fileName || !baseName) return false
  const lower = fileName.toLowerCase()
  const prefix = `${baseName.toLowerCase()}_`
  const starts = lower.startsWith(prefix)
  return starts
}

function splitPath(params: { path: string }) {
  const { path } = params
  const normalized = (path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  return segments
}

function sortProject(project: Project): Project {
  project.deployments.sort((a, b) => a.name.localeCompare(b.name))
  for (const dep of project.deployments) {
    dep.nights.sort((a, b) => a.name.localeCompare(b.name))
    for (const night of dep.nights) {
      night.photos.sort((a, b) => a.baseName.localeCompare(b.baseName))
      for (const photo of night.photos) {
        photo.patches.sort((a, b) => a.name.localeCompare(b.name))
      }
    }
  }
  return project
}
