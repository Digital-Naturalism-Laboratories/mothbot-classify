import { cn } from '~/utils/cn'

export type NumberProps = {
  value: number
  mono?: boolean
  format?: boolean
  className?: string
}

export function Number(props: NumberProps) {
  const { value, mono = false, format = true, className } = props
  const display = format ? formatInteger(value) : String(value)

  return <span className={cn(mono && 'font-mono tabular-nums', className)}>{display}</span>
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}
