import { useState } from 'react'
import { Link } from '@tanstack/react-router'

import { cn } from '~/utils/cn'
import {
  darkColorTokenGroups,
  hslFromCssVarValue,
  lightColorTokenGroups,
  type ColorTokenDefinition,
  type ColorTokenGroup,
} from './color-tokens'

type ThemeMode = 'light' | 'dark'

export function DesignSystemColors() {
  const [theme, setTheme] = useState<ThemeMode>('light')
  const groups = theme === 'light' ? lightColorTokenGroups : darkColorTokenGroups

  return (
    <div className='min-h-0 flex-1 overflow-y-auto bg-bkg-1 p-20 pt-12'>
      <header className='mb-24 max-w-3xl'>
        <nav className='flex flex-wrap items-center gap-12 text-13 text-ink-secondary'>
          <Link to='/' className='hover:text-ink-primary'>
            ← Home
          </Link>
          <Link to='/ad/ds/taxon-tree' className='hover:text-ink-primary'>
            Taxonomy tree lines →
          </Link>
        </nav>
        <h1 className='mt-8 text-24 font-medium text-ink-primary'>Design system — colors</h1>
        <p className='mt-8 text-14 text-ink-secondary text-wrap-pretty'>
          CSS custom properties from <code className='text-13'>src/styles/index.css</code> (
          <code className='text-13'>:root</code> and <code className='text-13'>.dark</code>). Tailwind maps semantic
          colors via <code className='text-13'>hsl(var(--token))</code>.
        </p>
        <ThemeToggle theme={theme} onThemeChange={setTheme} />
      </header>

      <div className='space-y-32'>
        {groups.map((group) => (
          <ColorTokenGroupSection key={group.id} group={group} />
        ))}
      </div>
    </div>
  )
}

function ThemeToggle(props: { theme: ThemeMode; onThemeChange: (theme: ThemeMode) => void }) {
  const { theme, onThemeChange } = props

  return (
    <div className='mt-16 flex gap-8'>
      <ThemeButton active={theme === 'light'} onClick={() => onThemeChange('light')}>
        :root (light)
      </ThemeButton>
      <ThemeButton active={theme === 'dark'} onClick={() => onThemeChange('dark')}>
        .dark
      </ThemeButton>
    </div>
  )
}

function ThemeButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const { active, onClick, children } = props

  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'rounded-md px-12 py-6 text-13 ring-1 ring-inset transition-colors',
        active
          ? 'bg-ink-primary text-white ring-ink-primary'
          : 'bg-white text-ink-primary ring-sageA-6 hover:bg-sage-2',
      )}
    >
      {children}
    </button>
  )
}

function ColorTokenGroupSection(props: { group: ColorTokenGroup }) {
  const { group } = props

  return (
    <section className='max-w-4xl'>
      <h2 className='mb-8 text-15 font-medium text-ink-primary'>{group.label}</h2>
      <ul className='divide-y divide-brdr-2 rounded-md border border-brdr-2 bg-white'>
        {group.tokens.map((token) => (
          <ColorTokenRow key={token.name} token={token} />
        ))}
      </ul>
    </section>
  )
}

function ColorTokenRow(props: { token: ColorTokenDefinition }) {
  const { token } = props
  const hsl = hslFromCssVarValue(token.value)

  return (
    <li className='flex items-center gap-12 px-12 py-8'>
      <div
        className='size-40 shrink-0 rounded-sm ring-1 ring-inset ring-black/10'
        style={{ backgroundColor: hsl }}
        aria-hidden
      />
      <div className='min-w-0 flex-1 font-mono text-12 leading-tight'>
        <p className='text-ink-primary'>{token.name}</p>
        <p className='mt-2 text-11 text-ink-secondary'>{token.value}</p>
        <p className='text-11 text-ink-secondary'>{hsl}</p>
      </div>
      {token.tailwindClass ? (
        <p className='shrink-0 font-mono text-11 text-highlight'>{token.tailwindClass}</p>
      ) : null}
    </li>
  )
}
