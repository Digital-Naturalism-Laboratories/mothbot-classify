import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'

import { TaxonomyRow } from '~/features/left-panel/taxonomy-row'
import {
  getBranchSpineProps,
  getElbowClassName,
  getStemDownClassName,
  TREE_LINE_LAYOUT,
} from '~/features/left-panel/taxonomy-tree-lines'
import { cn } from '~/utils/cn'

type PrimitiveSpec = {
  id: string
  title: string
  description: string
  render: () => React.ReactNode
}

const PRIMITIVES: PrimitiveSpec[] = [
  {
    id: 'stemDown',
    title: 'stemDown',
    description: 'Short vertical centered under the w-20 toggle into the child branch.',
    render: () => <span className={getStemDownClassName()} />,
  },
  {
    id: 'elbow-toggle',
    title: 'elbow → toggle',
    description: 'Short └ at row center; trunk supplies vertical between siblings.',
    render: () => <span className={getElbowClassName('toggle')} />,
  },
  {
    id: 'elbow-label',
    title: 'elbow → label',
    description: 'Same corner, wider reach to species row.',
    render: () => <span className={getElbowClassName('label')} />,
  },
]

export function DesignSystemTaxonTree() {
  return (
    <div className='min-h-0 flex-1 overflow-y-auto bg-bkg-1 p-20 pt-12'>
      <header className='mb-24 max-w-3xl'>
        <nav className='flex flex-wrap items-center gap-12 text-13 text-ink-secondary'>
          <Link to='/' className='hover:text-ink-primary'>
            ← Home
          </Link>
          <Link to='/ad/ds' className='hover:text-ink-primary'>
            Colors
          </Link>
        </nav>
        <h1 className='mt-8 text-24 font-medium text-ink-primary'>Design system — taxonomy tree lines</h1>
        <p className='mt-8 text-14 text-ink-secondary text-wrap-pretty'>
          Three primitives: <strong>stemDown</strong> (short, on parent row), <strong>branch spine</strong> (full height in
          children container), <strong>elbow</strong> (spine → row). Logic in{' '}
          <code className='text-13'>taxonomy-tree-lines.ts</code>.
        </p>
      </header>

      <div className='space-y-40 max-w-5xl'>
        <LayoutConstantsSection />
        <PrimitivesSection />
        <BranchSpineSection />
        <CompositeScenariosSection />
      </div>
    </div>
  )
}

function LayoutConstantsSection() {
  return (
    <section>
      <SectionTitle>Layout constants</SectionTitle>
      <ul className='mt-12 grid gap-8 sm:grid-cols-2 font-mono text-12 text-ink-secondary'>
        {Object.entries(TREE_LINE_LAYOUT).map(([key, value]) => (
          <li key={key} className='rounded-md border border-brdr-2 bg-white px-12 py-8'>
            <span className='text-ink-primary'>{key}</span>
            <span className='ml-8'>{value}px</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PrimitivesSection() {
  return (
    <section>
      <SectionTitle>Primitives (isolated)</SectionTitle>
      <ul className='mt-16 space-y-20'>
        {PRIMITIVES.map((spec) => (
          <li key={spec.id} className='rounded-md border border-brdr-2 bg-white p-16'>
            <h3 className='text-14 font-medium text-ink-primary'>{spec.title}</h3>
            <p className='mt-4 text-13 text-ink-secondary'>{spec.description}</p>
            <PanelChrome className='mt-12'>
              <div className='relative h-[48px] w-full'>
                <div className='absolute left-0 top-0 h-full w-20'>
                  <div className='absolute left-1/2 top-1/2 h-16 w-full -translate-x-1/2 -translate-y-1/2 rounded-sm bg-sidebar ring-1 ring-brdr-2' />
                  {spec.id === 'stemDown' ? spec.render() : null}
                </div>
                {spec.id !== 'stemDown' ? spec.render() : null}
              </div>
            </PanelChrome>
          </li>
        ))}
      </ul>
    </section>
  )
}

function BranchSpineSection() {
  return (
    <section>
      <SectionTitle>Branch spine</SectionTitle>
      <div className='mt-16 grid gap-24 lg:grid-cols-2'>
        <BranchExample title='Single child' childCount={1} />
        <BranchExample title='Two children' childCount={2} />
        <BranchExample title='Three children' childCount={3} className='lg:col-span-2 max-w-md' />
      </div>
    </section>
  )
}

function BranchExample(props: { title: string; childCount: number; className?: string }) {
  const { title, childCount, className } = props
  return (
    <div className={cn('rounded-md border border-brdr-2 bg-white p-16', className)}>
      <h3 className='text-14 font-medium text-ink-primary'>{title}</h3>
      <p className='mt-4 font-mono text-12 text-ink-secondary'>directRowCount={childCount}</p>
      <PanelChrome className='mt-12'>
        <TaxonomyRow
          rank='class'
          name='Insecta'
          count={100}
          onSelect={() => {}}
          canToggle
          hasChildren
          expanded
          hasExpandedChildren
        />
        <DemoIndentedBranch directRowCount={childCount}>
          {Array.from({ length: childCount }, (_, i) => (
            <TaxonomyRow
              key={i}
              rank='order'
              name={childCount === 1 ? 'Hymenoptera (only child)' : `Order ${i + 1}`}
              count={10 + i}
              onSelect={() => {}}
              inBranch
              canToggle={childCount > 1}
            />
          ))}
        </DemoIndentedBranch>
      </PanelChrome>
    </div>
  )
}

function CompositeScenariosSection() {
  return (
    <section>
      <SectionTitle>Composite trees</SectionTitle>
      <ul className='mt-16 space-y-24'>
        <li className='rounded-md border border-brdr-2 bg-white p-16'>
          <h3 className='text-14 font-medium text-ink-primary'>Deep branch</h3>
          <InteractiveDeepTree className='mt-12' />
        </li>
        <li className='rounded-md border border-brdr-2 bg-white p-16'>
          <h3 className='text-14 font-medium text-ink-primary'>Single-child order</h3>
          <SingleChildOrderTree className='mt-12' />
        </li>
      </ul>
    </section>
  )
}

function InteractiveDeepTree(props: { className?: string }) {
  const [classExpanded, setClassExpanded] = useState(true)
  const [orderExpanded, setOrderExpanded] = useState(true)

  return (
    <PanelChrome className={props.className}>
      <TaxonomyRow
        rank='class'
        name='Insecta'
        count={240}
        onSelect={() => {}}
        canToggle
        hasChildren
        expanded={classExpanded}
        onToggleExpanded={() => setClassExpanded((v) => !v)}
        hasExpandedChildren={classExpanded}
      />
      {classExpanded ? (
        <DemoIndentedBranch directRowCount={3}>
          <TaxonomyRow
            rank='order'
            name='Lepidoptera'
            count={80}
            onSelect={() => {}}
            inBranch
            canToggle
            hasChildren
            expanded={orderExpanded}
            onToggleExpanded={() => setOrderExpanded((v) => !v)}
            hasExpandedChildren={orderExpanded}
          />
          {orderExpanded ? (
            <DemoIndentedBranch directRowCount={2}>
              <TaxonomyRow
                rank='family'
                name='Nymphalidae'
                count={40}
                onSelect={() => {}}
                inBranch
                canToggle
                hasChildren
                expanded
                hasExpandedChildren
              />
              <DemoIndentedBranch directRowCount={1}>
                <TaxonomyRow
                  rank='genus'
                  name='Danaus'
                  count={20}
                  onSelect={() => {}}
                  inBranch
                  canToggle
                  hasChildren
                  expanded
                  hasExpandedChildren
                />
                <DemoIndentedBranch directRowCount={2}>
                  <TaxonomyRow rank='species' name='plexippus' count={12} onSelect={() => {}} inBranch />
                  <TaxonomyRow rank='species' name='gilippus' count={8} onSelect={() => {}} inBranch isAbsoluteLast />
                </DemoIndentedBranch>
              </DemoIndentedBranch>
              <TaxonomyRow rank='family' name='Pieridae' count={25} onSelect={() => {}} inBranch canToggle expanded={false} />
            </DemoIndentedBranch>
          ) : null}
          <TaxonomyRow rank='order' name='Coleoptera' count={60} onSelect={() => {}} inBranch canToggle expanded={false} />
          <TaxonomyRow rank='order' name='Diptera' count={50} onSelect={() => {}} inBranch canToggle expanded={false} isAbsoluteLast />
        </DemoIndentedBranch>
      ) : null}
    </PanelChrome>
  )
}

function SingleChildOrderTree(props: { className?: string }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <PanelChrome className={props.className}>
      <TaxonomyRow
        rank='class'
        name='Insecta'
        count={12}
        onSelect={() => {}}
        canToggle
        hasChildren
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        hasExpandedChildren={expanded}
      />
      {expanded ? (
        <DemoIndentedBranch directRowCount={1}>
          <TaxonomyRow rank='order' name='Hymenoptera' count={12} onSelect={() => {}} inBranch canToggle expanded={false} isAbsoluteLast />
        </DemoIndentedBranch>
      ) : null}
    </PanelChrome>
  )
}

function PanelChrome(props: { className?: string; children: React.ReactNode }) {
  const { className, children } = props

  return (
    <div className={cn('w-[300px] rounded-md bg-sidebar px-8 py-8 ring-1 ring-inset ring-brdr-2', className)}>{children}</div>
  )
}

function DemoIndentedBranch(props: { directRowCount: number; className?: string; children: React.ReactNode }) {
  const { directRowCount, className, children } = props
  const spine = getBranchSpineProps(directRowCount)

  return (
    <div className={cn('relative ml-8 pl-16', className)}>
      {spine ? <div className={spine.className} style={spine.style} aria-hidden /> : null}
      {children}
    </div>
  )
}

function SectionTitle(props: { children: React.ReactNode }) {
  return <h2 className='text-15 font-medium text-ink-primary'>{props.children}</h2>
}
