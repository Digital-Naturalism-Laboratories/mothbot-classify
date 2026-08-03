import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip'
import { cn } from '~/utils/cn'
export type AppDocsPeekProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type DocTocEntry = {
  id: string
  label: string
}

type DocTocGroup = {
  id: string
  label: string
  entries: DocTocEntry[]
}

const APP_DOCS_TOC: DocTocGroup[] = [
  {
    id: 'datasets',
    label: 'How datasets work',
    entries: [
      { id: 'datasets-folder', label: 'Datasets folder' },
      { id: 'datasets-package', label: 'Folder layout' },
      { id: 'datasets-setup', label: 'First-time setup' },
    ],
  },
  {
    id: 'collaboration',
    label: 'Collaboration',
    entries: [
      { id: 'collab-overview', label: 'Overview' },
      { id: 'collab-send', label: '1. Zip and send' },
      { id: 'collab-receive', label: '2. Receive' },
      { id: 'collab-classify', label: '3. Classify' },
      { id: 'collab-return', label: '4. Send back' },
      { id: 'collab-merge', label: '5. Merge' },
    ],
  },
]

export function AppDocsPeek(props: AppDocsPeekProps) {
  const { open, onOpenChange } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeSectionId = useActiveSectionId({ scrollRef, open })

  function scrollToSection(sectionId: string) {
    const root = scrollRef.current
    if (!root) return
    const target = root.querySelector<HTMLElement>(`#${sectionId}`)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        align='vhSide'
        onClose={() => onOpenChange(false)}
        className='!flex !w-[min(864px,80vw)] !max-w-[80vw] flex-col gap-0 !overflow-hidden p-0'
      >
        <DialogHeader
          className='shrink-0 animate-in fade-in slide-in-from-top-2 border-b border-neutral-200 px-24 py-20 text-left duration-300 ease-out'
          style={{ animationDelay: '40ms', animationFillMode: 'backwards' }}
        >
          <DialogTitle className='text-balance text-18 font-semibold text-neutral-900'>Documentation</DialogTitle>
          <p className='mt-8 text-pretty text-13 font-normal text-neutral-600'>
            How datasets work and how to collaborate. More topics will be added here over time.
          </p>
        </DialogHeader>

        <div className='flex min-h-0 flex-1'>
          <AppDocsTableOfContents onSelect={scrollToSection} activeSectionId={activeSectionId} />
          <div
            ref={scrollRef}
            className='flex min-h-0 flex-1 animate-in fade-in slide-in-from-bottom-2 flex-col gap-32 overflow-y-auto px-24 py-24 duration-500 ease-out'
            style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}
          >
            <DatasetsSection />
            <CollaborationSection />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function useActiveSectionId(params: { scrollRef: React.RefObject<HTMLDivElement | null>; open: boolean }) {
  const { scrollRef, open } = params
  const [activeId, setActiveId] = useState<string | null>(null)

  const sectionIds = useMemo(() => collectSectionIds(), [])

  useEffect(() => {
    if (!open) return
    const root = scrollRef.current
    if (!root) return

    const targets = sectionIds
      .map((id) => root.querySelector<HTMLElement>(`#${id}`))
      .filter((node): node is HTMLElement => !!node)
    if (targets.length === 0) return

    const visible = new Map<string, number>()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id
          if (entry.isIntersecting) visible.set(id, entry.intersectionRatio)
          else visible.delete(id)
        }

        const topMost = pickTopMostVisible({ targets, visible })
        if (topMost) setActiveId(topMost)
      },
      { root, rootMargin: '0px 0px -70% 0px', threshold: [0, 0.1, 0.5, 1] },
    )

    targets.forEach((node) => observer.observe(node))
    setActiveId(targets[0]?.id ?? null)

    return () => observer.disconnect()
  }, [open, scrollRef, sectionIds])

  return activeId
}

function collectSectionIds() {
  const ids: string[] = []
  for (const group of APP_DOCS_TOC) {
    ids.push(group.id)
    for (const entry of group.entries) ids.push(entry.id)
  }
  return ids
}

function pickTopMostVisible(params: { targets: HTMLElement[]; visible: Map<string, number> }) {
  const { targets, visible } = params
  if (visible.size === 0) return null
  let chosen: { id: string; top: number } | null = null
  for (const node of targets) {
    if (!visible.has(node.id)) continue
    const top = node.getBoundingClientRect().top
    if (!chosen || top < chosen.top) chosen = { id: node.id, top }
  }
  return chosen?.id ?? null
}

function AppDocsTableOfContents(props: {
  onSelect: (sectionId: string) => void
  activeSectionId: string | null
}) {
  const { onSelect, activeSectionId } = props

  return (
    <nav
      className='flex w-[200px] shrink-0 animate-in fade-in slide-in-from-left-2 flex-col gap-20 overflow-y-auto border-r border-neutral-200 bg-neutral-50/80 px-16 py-20 duration-300 ease-out'
      style={{ animationDelay: '120ms', animationFillMode: 'backwards' }}
      aria-label='Table of contents'
    >
      {APP_DOCS_TOC.map((group) => {
        const isGroupActive = activeSectionId === group.id
        return (
          <div key={group.id}>
            <TocGroupButton
              label={group.label}
              isActive={isGroupActive}
              onClick={() => onSelect(group.id)}
            />
            <ul className='mt-6 flex flex-col gap-2 pl-8'>
              {group.entries.map((entry) => (
                <li key={entry.id}>
                  <TocEntryButton
                    label={entry.label}
                    isActive={activeSectionId === entry.id}
                    onClick={() => onSelect(entry.id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

function TocGroupButton(props: { label: string; isActive: boolean; onClick: () => void }) {
  const { label, isActive, onClick } = props

  return (
    <button
      type='button'
      onClick={onClick}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'group relative flex w-full items-center rounded-md px-8 py-6 text-left text-13 font-medium',
        'transition-[background-color,color,scale] duration-150 ease-out hover:bg-neutral-100 active:scale-[0.96]',
        isActive ? 'bg-neutral-900/[0.06] text-neutral-900' : 'text-neutral-900',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute left-[-12px] top-1/2 h-16 w-2 -translate-y-1/2 rounded-full bg-neutral-900',
          'transition-[opacity,transform] duration-200 ease-out',
          isActive ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50',
        )}
      />
      {label}
    </button>
  )
}

function TocEntryButton(props: { label: string; isActive: boolean; onClick: () => void }) {
  const { label, isActive, onClick } = props

  return (
    <button
      type='button'
      onClick={onClick}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'group relative flex w-full items-center rounded-md px-8 py-4 text-left text-12 tabular-nums',
        'transition-[background-color,color,transform,scale] duration-150 ease-out',
        'hover:translate-x-2 hover:bg-neutral-100 hover:text-neutral-900 active:scale-[0.96]',
        isActive ? 'bg-neutral-900/[0.06] font-medium text-neutral-900' : 'text-neutral-600',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute left-[-12px] top-1/2 h-12 w-2 -translate-y-1/2 rounded-full bg-neutral-900',
          'transition-[opacity,transform] duration-200 ease-out',
          isActive ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50',
        )}
      />
      {label}
    </button>
  )
}

export function AppDocsPeekTrigger(props: { onOpen: () => void }) {
  const { onOpen } = props

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='outline'
            size='xsm'
            type='button'
            className='min-w-0 px-10'
            aria-label='Documentation'
            onClick={onOpen}
          >
            <BookOpen className='h-16 w-16' aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='bottom'>Documentation</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function DatasetsSection() {
  return (
    <DocSection id='datasets' title='How datasets work'>
      <DocParagraph>
        Mothbox Classify works with <strong>dataset folders</strong> on your computer. Nothing is uploaded — your
        photos, records, and labels stay on your machine.
      </DocParagraph>

      <DocSubheading id='datasets-folder'>Datasets folder</DocSubheading>
      <DocList
        items={[
          <>
            On the home screen, pick one folder where you'll keep all your datasets. For example{' '}
            <DocCode>~/Mothbox/datasets/</DocCode> on Mac or Linux, or{' '}
            <DocCode>{`C:\\Users\\You\\Mothbox\\datasets\\`}</DocCode> on Windows.
          </>,
          <>
            Each subfolder inside that — one with a <DocCode>dataset.json</DocCode> file — is one dataset.
          </>,
          <>
            After you add or move folders in Finder or File Explorer, click <strong>Refresh datasets</strong> and open
            the dataset you want to work on.
          </>,
        ]}
      />

      <DocSubheading id='datasets-package'>What is inside a dataset</DocSubheading>
      <DocCodeBlock>
        {`my-dataset/
  dataset.json
  00_source/          original photos (optional)
  01_patches/         insect crops to label
  02_records/         info about each crop
  03_classifications/ labels (model + people)
  04_exports/         data you export`}
      </DocCodeBlock>

      <DocList
        items={[
          <>A <strong>patch</strong> is one insect crop — the image you Accept or Identify in the app.</>,
          <>
            The AI model's labels live in <DocCode>03_classifications/_bot.ndjson</DocCode>. Think of the model as your
            first collaborator on the dataset.
          </>,
          <>
            Your labels are saved separately in <DocCode>03_classifications/{`{your-initials}.ndjson`}</DocCode>. Set
            your initials in the avatar menu.
          </>,
          <>
            When several people have labeled the same crop, the app shows the most recent human label. The model only
            wins if no human has weighed in yet.
          </>,
        ]}
      />

      <DocSubheading id='datasets-setup'>First-time setup</DocSubheading>
      <DocList
        items={[
          <>
            Drop a dataset folder (with photos and the model's detections from the Mothbox pipeline) into your datasets
            folder.
          </>,
          <>
            Click <strong>Refresh datasets</strong>. The app organizes everything into the standard layout for you.
          </>,
          <>
            On a team, one person usually keeps the original photos in <DocCode>00_source/</DocCode>; everyone else
            works from a smaller copy without them.
          </>,
        ]}
      />
    </DocSection>
  )
}

function CollaborationSection() {
  return (
    <DocSection id='collaboration' title='Collaboration'>
      <DocSubheading id='collab-overview'>Overview</DocSubheading>
      <DocParagraph>
        Mothbox Classify doesn't have an in-app send button yet, so collaboration happens by sharing a zip file — over
        email, Google Drive, Dropbox, USB, whatever your team already uses. Each person works in their own labels
        file, so merging is just dropping that file back into the dataset.
      </DocParagraph>

      <DocSubheading id='collab-send'>1. Sender — zip and send</DocSubheading>
      <DocList
        items={[
          <>Save your work in the app.</>,
          <>
            In Finder or File Explorer, open the dataset folder (the one that contains <DocCode>dataset.json</DocCode>
            ).
          </>,
          <>
            Compress it into a <DocCode>.zip</DocCode>. Include <DocCode>dataset.json</DocCode>,{' '}
            <DocCode>01_patches/</DocCode>, <DocCode>02_records/</DocCode>, and <DocCode>03_classifications/</DocCode>.
          </>,
          <>
            Leave out <DocCode>00_source/</DocCode> (the original photos) to keep the zip small — usually 20–200 MB.
          </>,
          <>
            If you'd like them to continue from where you left off, include your own file from{' '}
            <DocCode>03_classifications/</DocCode> too.
          </>,
          <>Tell them which group to focus on — for example, all Orthoptera in the dataset.</>,
        ]}
      />
      <DocPlatformZipHint />

      <DocSubheading id='collab-receive'>2. Collaborator — receive</DocSubheading>
      <DocList
        items={[
          <>If you haven't already, click <strong>Choose datasets folder…</strong> on the home screen.</>,
          <>
            Unzip the file (double-click usually works) and move the dataset folder into your datasets folder.
          </>,
          <>
            Click <strong>Refresh datasets</strong> and open the dataset.
          </>,
          <>
            Set your initials in the avatar menu. Your labels will be saved to{' '}
            <DocCode>03_classifications/{`{your-initials}.ndjson`}</DocCode>.
          </>,
        ]}
      />

      <DocSubheading id='collab-classify'>3. Collaborator — classify</DocSubheading>
      <DocParagraph>
        Classify normally — Accept or Identify each patch. Don't edit <DocCode>_bot.ndjson</DocCode> or anyone else's
        file by hand; the app takes care of merging.
      </DocParagraph>

      <DocSubheading id='collab-return'>4. Collaborator — send back</DocSubheading>
      <DocList
        items={[
          <>
            You only need to send back your own labels file —{' '}
            <DocCode>03_classifications/{`{your-initials}.ndjson`}</DocCode>. No need to zip the whole dataset again.
          </>,
          <>Tell the sender your initials so they know which file is yours.</>,
        ]}
      />

      <DocSubheading id='collab-merge'>5. Sender — merge their work</DocSubheading>
      <DocList
        items={[
          <>
            Drop their file into your dataset's <DocCode>03_classifications/</DocCode> folder. If they're sending an
            update, just replace the previous version.
          </>,
          <>Go back to the home screen and open the dataset again — their labels will load in.</>,
        ]}
      />

      <p className='text-pretty text-12 text-neutral-500'>
        More detailed notes: <DocCode>docs/collaboration-handoff.md</DocCode>.
      </p>
    </DocSection>
  )
}

function DocSection(props: { id: string; title: string; children: ReactNode }) {
  const { id, title, children } = props

  return (
    <section id={id} className='scroll-mt-24'>
      <h2 className='text-balance text-16 font-semibold text-neutral-900'>{title}</h2>
      <div className='mt-16 flex flex-col gap-16'>{children}</div>
    </section>
  )
}

function DocSubheading(props: { id: string; children: ReactNode }) {
  const { id, children } = props

  return (
    <h3 id={id} className='scroll-mt-24 text-balance text-14 font-medium text-neutral-800'>
      {children}
    </h3>
  )
}

function DocParagraph(props: { children: ReactNode }) {
  return <p className='text-pretty text-13 leading-relaxed text-neutral-700'>{props.children}</p>
}

function DocList(props: { items: ReactNode[] }) {
  return (
    <ol className='list-decimal space-y-8 pl-20 text-pretty text-13 leading-relaxed text-neutral-700'>
      {props.items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ol>
  )
}

function DocCode(props: { children: ReactNode }) {
  return (
    <code className='rounded bg-neutral-100 px-6 py-1 font-mono text-12 text-neutral-800'>{props.children}</code>
  )
}

function DocCodeBlock(props: { children: string }) {
  return (
    <pre className='overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 px-16 py-12 font-mono text-11 leading-relaxed text-neutral-800'>
      {props.children}
    </pre>
  )
}

function DocPlatformZipHint() {
  return (
    <div className='rounded-md border border-neutral-200 bg-neutral-50 px-16 py-12 text-pretty text-12 leading-relaxed text-neutral-600'>
      <p className='font-medium text-neutral-800'>How to make the zip</p>
      <ul className='mt-8 list-disc space-y-6 pl-20'>
        <li>
          <strong>Mac:</strong> right-click the dataset folder → <em>Compress “folder name”</em>.
        </li>
        <li>
          <strong>Windows:</strong> right-click the dataset folder → <em>Send to</em> →{' '}
          <em>Compressed (zipped) folder</em>.
        </li>
        <li>
          <strong>Linux:</strong> right-click → <em>Compress</em>, or in a terminal run{' '}
          <DocCode>zip -r my-dataset.zip my-dataset/</DocCode>.
        </li>
      </ul>
    </div>
  )
}
