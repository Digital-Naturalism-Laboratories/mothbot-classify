import { type DatasetRegistryEntry, setDatasetsRegistry } from '~/stores/datasets-registry'
import { discoverDatasetFolders } from './discover-dataset-folders'
import { migratePendingDatasetFolders } from './migrate-pending-dataset-folders'
import { promptUntrackedPendingDatasetSetup } from './check-for-new-dataset-folders'
import { toast } from 'sonner'
import { combineProjectPackages } from './combine-project-packages'
import { applyRecordsToMove, hasRecordsToMove } from './records-to-move'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import type { ProjectToCombine } from './project-folder'

const COMBINE_TOAST_ID = 'combine-project-records'
const MOVE_TOAST_ID = 'move-project-records'

async function moveRecordsBetweenProjects(root: Parameters<typeof applyRecordsToMove>[0]['root']) {
  try {
    const result = await applyRecordsToMove({
      root,
      onProgress: (message) => toast.loading('Moving records with their folders…', { id: MOVE_TOAST_ID, description: message }),
    })
    if (result.moved.length) {
      const lines = result.moved.map(
        (m) => `${m.from} → ${m.to}: ${m.patches.toLocaleString()} patches, ${m.humanLines.toLocaleString()} human identifications`,
      )
      toast.success('Records moved with their folders', {
        id: MOVE_TOAST_ID,
        duration: 12000,
        description: `${lines.join('; ')}. Both projects' earlier records are in their _processed/_backups.`,
      })
    } else {
      toast.dismiss(MOVE_TOAST_ID)
    }
    if (result.waiting.length) {
      const w = result.waiting[0]
      toast.info(`Some of ${w.to}'s records are still in ${w.from}`, {
        duration: 15000,
        description: `Open the folder that holds both ${w.to} and ${w.from} so they can move across.`,
      })
    }
  } catch (err) {
    console.log('🚨 moveRecordsBetweenProjects: failed', err)
    toast.error("Couldn't move records with their folders", {
      id: MOVE_TOAST_ID,
      duration: 15000,
      description: `${err instanceof Error ? err.message : String(err)}`,
    })
  }
}

async function combineProjects(projects: ProjectToCombine[]) {
  for (const project of projects) {
    try {
      const result = await combineProjectPackages({
        processed: project.processed,
        projectName: project.folderName,
        onProgress: (message) =>
          toast.loading(`Updating ${project.folderName} to one set of project records…`, {
            id: COMBINE_TOAST_ID,
            description: message,
          }),
      })
      if (result) {
        toast.success(`${project.folderName} now has one set of project records`, {
          id: COMBINE_TOAST_ID,
          duration: 10000,
          description: `Combined ${result.folders.join(', ')} (${result.patches.toLocaleString()} patches). Every identification was kept; the old files are in _processed/${result.backupPath}.`,
        })
      }
    } catch (err) {
      console.log('🚨 combineProjects: failed', { project: project.folderName, err })
      toast.error(`Couldn't update ${project.folderName}`, {
        id: COMBINE_TOAST_ID,
        duration: 15000,
        description: `${err instanceof Error ? err.message : String(err)} Its records were not changed.`,
      })
    }
  }
}

/** What the last scan of the picked folder found, so the picker can explain an empty result. */
export type LastScanSummary = { projectCount: number; pendingCount: number; unprocessedProjectName?: string }
let lastScanSummary: LastScanSummary = { projectCount: 0, pendingCount: 0 }
export function getLastScanSummary(): LastScanSummary {
  return lastScanSummary
}

export type ScanDatasetsFolderOptions = {
  /** When true (default), migrates legacy folders immediately. */
  autoMigrate?: boolean
}

export async function scanDatasetsFolder(options?: ScanDatasetsFolderOptions): Promise<DatasetRegistryEntry[]> {
  const autoMigrate = options?.autoMigrate ?? true
  let found = await discoverDatasetFolders()
  // Older projects keep one package per folder inside _processed: combine them into
  // one set of records for the project (backed up first), then look again.
  if (found.toCombine?.length) {
    await combineProjects(found.toCombine)
    found = await discoverDatasetFolders()
  }
  // Folders Mothbot Process moved between projects: their records follow them.
  const root = await requireDatasetsFolderHandle({ mode: 'readwrite', notifyOnDenied: false })
  if (root && (await hasRecordsToMove(root))) {
    await moveRecordsBetweenProjects(root)
    found = await discoverDatasetFolders()
    if (found.toCombine?.length) {
      await combineProjects(found.toCombine)
      found = await discoverDatasetFolders()
    }
  }
  const { packages, pendingMigration, unprocessedProjectName } = found
  lastScanSummary = { projectCount: packages.length, pendingCount: pendingMigration.length, unprocessedProjectName }

  let entries = [...packages]

  if (autoMigrate && pendingMigration.length > 0) {
    const { migrated } = await migratePendingDatasetFolders(pendingMigration)
    entries = [...entries, ...migrated]
  }

  const sorted = entries.sort((a, b) => a.folderName.localeCompare(b.folderName))
  setDatasetsRegistry(sorted)
  await promptUntrackedPendingDatasetSetup({ registry: sorted, pendingMigration })

  return sorted
}

/** Re-scan datasets root and replace registry (drops folders removed from disk). */
export async function refreshRegisteredPackagesFromDisk(): Promise<DatasetRegistryEntry[]> {
  const { packages } = await discoverDatasetFolders()
  const sorted = [...packages].sort((a, b) => a.folderName.localeCompare(b.folderName))
  setDatasetsRegistry(sorted)
  return sorted
}
