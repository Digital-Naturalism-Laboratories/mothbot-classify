import { useStore } from '@nanostores/react'
import { projectsStore } from '~/stores/entities/1.projects'
import { sitesStore } from '~/stores/entities/2.sites'
import { deploymentsStore } from '~/stores/entities/3.deployments'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { detectionsStore } from '~/stores/entities/detections'
import { leafGroupSummariesStore } from '~/stores/entities/night-summaries'
import { pickerErrorStore } from '~/stores/ui'
import { useAppLoading } from '~/features/data-flow/1.ingest/files-queries'
import { Row } from '~/styles'
import { HomeDatasetsPanel } from './home-datasets-panel'
import { ProjectsSection } from './projects-section'

export function Home() {
  const { isBlockingLoading, isOpeningDataset } = useAppLoading()
  const isLoadingProjects = isBlockingLoading || isOpeningDataset
  const pickerError = useStore(pickerErrorStore)
  const projects = useStore(projectsStore)
  const sites = useStore(sitesStore)
  const deployments = useStore(deploymentsStore)
  const nights = useStore(leafGroupsStore)
  const detections = useStore(detectionsStore)
  const nightSummaries = useStore(leafGroupSummariesStore)

  return (
    <Row className='p-20 pt-12 h-full min-h-0 items-start gap-16 overflow-y-auto'>
      <div className='flex w-[240px] shrink-0 self-stretch min-h-0 flex-col'>
        <HomeDatasetsPanel />
      </div>
      <div className='min-h-0 flex-1'>
        {pickerError ? (
          <div className='mb-12 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 text-pretty'>{pickerError}</div>
        ) : null}
        <ProjectsSection
          isLoading={isLoadingProjects}
          projects={projects}
          sites={sites}
          deployments={deployments}
          nights={nights}
          detections={detections}
          nightSummaries={nightSummaries}
        />
      </div>
    </Row>
  )
}
