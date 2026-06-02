export type DinalabAdapterSourceIO = {
  exists: (relativePath: string) => Promise<boolean>
  readText: (relativePath: string) => Promise<string>
  readBinary: (relativePath: string) => Promise<ArrayBuffer>
  findFiles: (predicate: (fileName: string) => boolean) => Promise<string[]>
}

export type DinalabAdapterPackageIO = {
  writeText: (relativePath: string, text: string) => Promise<void>
  copyFromSource: (params: { sourceRelativePath: string; packageRelativePath: string }) => Promise<void>
}

export type DinalabAdapterIO = {
  source: DinalabAdapterSourceIO
  package: DinalabAdapterPackageIO
}

export type DinalabAdapterResult = {
  datasetId: string
  patchCount: number
  botRowCount: number
  humanRowCount: number
}

export type { DinalabAdapterProgress, DinalabAdapterProgressCallback } from './adapter-progress'
