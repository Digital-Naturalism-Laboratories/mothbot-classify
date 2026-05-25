import type { ForeignFolderCandidate } from './package-foreign-folders'

export function buildForeignContentDialogCopy(params: {
  packageFolderName: string
  foreignFolders: ForeignFolderCandidate[]
  photosOnly: ForeignFolderCandidate[]
}) {
  const { packageFolderName, foreignFolders, photosOnly } = params
  const count = foreignFolders.length
  const folderList = foreignFolders.map((folder) => folder.folderName).join(', ')
  const title = count === 1 ? 'Add new folder to dataset?' : `Add ${count} new folders?`

  const lead =
    count === 1
      ? `New detection data in ${packageFolderName} — ${folderList}. Add merges it into this dataset and reloads.`
      : `New detection data in ${packageFolderName} — ${folderList}. Add merges them into this dataset and reloads.`

  const photosOnlyNote =
    photosOnly.length > 0
      ? `Skipped ${photosOnly.length} folder${photosOnly.length === 1 ? '' : 's'} with photos only (no bot detections yet).`
      : null

  return { title, lead, photosOnlyNote, folderList }
}
