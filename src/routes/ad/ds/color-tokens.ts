export type ColorTokenGroup = {
  id: string
  label: string
  tokens: ColorTokenDefinition[]
}

export type ColorTokenDefinition = {
  name: string
  value: string
  tailwindClass?: string
}

/** HSL components from `src/styles/index.css` — keep in sync with :root / .dark. */
export const lightColorTokenGroups: ColorTokenGroup[] = [
  {
    id: 'surface',
    label: 'Surface',
    tokens: [
      { name: '--background', value: '0 0% 100%', tailwindClass: 'bg-background' },
      { name: '--foreground', value: '222.2 47.4% 11.2%', tailwindClass: 'text-foreground' },
      { name: '--card', value: '0 0% 100%', tailwindClass: 'bg-card' },
      { name: '--card-foreground', value: '222.2 47.4% 11.2%', tailwindClass: 'text-card-foreground' },
      { name: '--popover', value: '0 0% 100%', tailwindClass: 'bg-popover' },
      { name: '--popover-foreground', value: '222.2 47.4% 11.2%', tailwindClass: 'text-popover-foreground' },
    ],
  },
  {
    id: 'ui',
    label: 'UI',
    tokens: [
      { name: '--muted', value: '210 40% 96.1%', tailwindClass: 'bg-muted' },
      { name: '--muted-foreground', value: '215.4 16.3% 46.9%', tailwindClass: 'text-muted-foreground' },
      { name: '--border', value: '214.3 31.8% 91.4%', tailwindClass: 'border-border' },
      { name: '--input', value: '214.3 31.8% 91.4%', tailwindClass: 'border-input' },
      { name: '--ring', value: '215 20.2% 65.1%', tailwindClass: 'ring-ring' },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    tokens: [
      { name: '--primary', value: '133 37% 36%', tailwindClass: 'bg-primary' },
      { name: '--primary-foreground', value: '210 40% 98%', tailwindClass: 'text-primary-foreground' },
      { name: '--secondary', value: '133 0% 100%', tailwindClass: 'bg-secondary' },
      { name: '--secondary-foreground', value: '222.2 47.4% 11.2%', tailwindClass: 'text-secondary-foreground' },
      { name: '--accent', value: '160, 10%, 94%', tailwindClass: 'bg-accent' },
      { name: '--accent-foreground', value: '222.2 47.4% 11.2%', tailwindClass: 'text-accent-foreground' },
      { name: '--destructive', value: '0 100% 50%', tailwindClass: 'bg-destructive' },
      { name: '--destructive-foreground', value: '210 40% 98%', tailwindClass: 'text-destructive-foreground' },
    ],
  },
  {
    id: 'sidebar',
    label: 'Sidebar',
    tokens: [
      { name: '--sidebar-background', value: '0 0% 91%', tailwindClass: 'bg-sidebar' },
      { name: '--sidebar-foreground', value: '240 5.3% 26.1%', tailwindClass: 'text-sidebar-foreground' },
      { name: '--sidebar-primary', value: '240 5.9% 10%', tailwindClass: 'bg-sidebar-primary' },
      { name: '--sidebar-primary-foreground', value: '0 0% 98%', tailwindClass: 'text-sidebar-primary-foreground' },
      { name: '--sidebar-accent', value: '240 4.8% 95.9%', tailwindClass: 'bg-sidebar-accent' },
      { name: '--sidebar-accent-foreground', value: '240 5.9% 10%', tailwindClass: 'text-sidebar-accent-foreground' },
      { name: '--sidebar-border', value: '220 13% 91%', tailwindClass: 'border-sidebar-border' },
      { name: '--sidebar-ring', value: '217.2 91.2% 59.8%', tailwindClass: 'ring-sidebar-ring' },
    ],
  },
  {
    id: 'chart',
    label: 'Chart',
    tokens: [
      { name: '--chart-1', value: '12 76% 61%' },
      { name: '--chart-2', value: '173 58% 39%' },
      { name: '--chart-3', value: '197 37% 24%' },
      { name: '--chart-4', value: '43 74% 66%' },
      { name: '--chart-5', value: '27 87% 67%' },
    ],
  },
]

export const darkColorTokenGroups: ColorTokenGroup[] = [
  {
    id: 'surface',
    label: 'Surface',
    tokens: [
      { name: '--background', value: '224 71% 4%', tailwindClass: 'bg-background' },
      { name: '--foreground', value: '213 31% 91%', tailwindClass: 'text-foreground' },
      { name: '--card', value: '0 0% 100%', tailwindClass: 'bg-card' },
      { name: '--card-foreground', value: '222.2 47.4% 11.2%', tailwindClass: 'text-card-foreground' },
      { name: '--popover', value: '224 71% 4%', tailwindClass: 'bg-popover' },
      { name: '--popover-foreground', value: '215 20.2% 65.1%', tailwindClass: 'text-popover-foreground' },
    ],
  },
  {
    id: 'ui',
    label: 'UI',
    tokens: [
      { name: '--muted', value: '223 47% 11%', tailwindClass: 'bg-muted' },
      { name: '--muted-foreground', value: '215.4 16.3% 56.9%', tailwindClass: 'text-muted-foreground' },
      { name: '--border', value: '216 34% 17%', tailwindClass: 'border-border' },
      { name: '--input', value: '216 34% 17%', tailwindClass: 'border-input' },
      { name: '--ring', value: '216 34% 17%', tailwindClass: 'ring-ring' },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    tokens: [
      { name: '--primary', value: '210 40% 98%', tailwindClass: 'bg-primary' },
      { name: '--primary-foreground', value: '222.2 47.4% 1.2%', tailwindClass: 'text-primary-foreground' },
      { name: '--secondary', value: '222.2 47.4% 11.2%', tailwindClass: 'bg-secondary' },
      { name: '--secondary-foreground', value: '210 40% 98%', tailwindClass: 'text-secondary-foreground' },
      { name: '--accent', value: '216 34% 17%', tailwindClass: 'bg-accent' },
      { name: '--accent-foreground', value: '210 40% 98%', tailwindClass: 'text-accent-foreground' },
      { name: '--destructive', value: '0 63% 31%', tailwindClass: 'bg-destructive' },
      { name: '--destructive-foreground', value: '210 40% 98%', tailwindClass: 'text-destructive-foreground' },
    ],
  },
  {
    id: 'sidebar',
    label: 'Sidebar',
    tokens: [
      { name: '--sidebar-background', value: '240 5.9% 10%', tailwindClass: 'bg-sidebar' },
      { name: '--sidebar-foreground', value: '240 4.8% 95.9%', tailwindClass: 'text-sidebar-foreground' },
      { name: '--sidebar-primary', value: '224.3 76.3% 48%', tailwindClass: 'bg-sidebar-primary' },
      { name: '--sidebar-primary-foreground', value: '0 0% 100%', tailwindClass: 'text-sidebar-primary-foreground' },
      { name: '--sidebar-accent', value: '240 3.7% 15.9%', tailwindClass: 'bg-sidebar-accent' },
      { name: '--sidebar-accent-foreground', value: '240 4.8% 95.9%', tailwindClass: 'text-sidebar-accent-foreground' },
      { name: '--sidebar-border', value: '240 3.7% 15.9%', tailwindClass: 'border-sidebar-border' },
      { name: '--sidebar-ring', value: '217.2 91.2% 59.8%', tailwindClass: 'ring-sidebar-ring' },
    ],
  },
  {
    id: 'chart',
    label: 'Chart',
    tokens: [
      { name: '--chart-1', value: '220 70% 50%' },
      { name: '--chart-2', value: '160 60% 45%' },
      { name: '--chart-3', value: '30 80% 55%' },
      { name: '--chart-4', value: '280 65% 60%' },
      { name: '--chart-5', value: '340 75% 55%' },
    ],
  },
]

export function hslFromCssVarValue(value: string) {
  return `hsl(${value})`
}
