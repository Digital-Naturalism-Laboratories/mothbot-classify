import { atom } from 'nanostores'

export type LeafGroupEntity = {
  id: string
  name: string
  datasetId: string
  siteId: string
  deploymentId: string
}

export const leafGroupsStore = atom<Record<string, LeafGroupEntity>>({})
