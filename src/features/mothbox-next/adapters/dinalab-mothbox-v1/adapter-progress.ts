export type DinalabAdapterProgressPhase = 'scan' | 'patches' | 'archive' | 'records'

export type DinalabAdapterProgress = {
  phase: DinalabAdapterProgressPhase
  message: string
  description?: string
}

export type DinalabAdapterProgressCallback = (progress: DinalabAdapterProgress) => void

export type ThrottledDinalabAdapterProgressCallback = DinalabAdapterProgressCallback & {
  flush: () => void
}

export function createThrottledProgressCallback(
  callback: DinalabAdapterProgressCallback,
  intervalMs = 250,
): ThrottledDinalabAdapterProgressCallback {
  let lastEmit = 0
  let lastPhase: DinalabAdapterProgressPhase | null = null
  let pending: DinalabAdapterProgress | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!pending) return
    callback(pending)
    pending = null
    lastEmit = Date.now()
  }

  const throttled: ThrottledDinalabAdapterProgressCallback = (progress) => {
    pending = progress
    const phaseChanged = progress.phase !== lastPhase
    lastPhase = progress.phase

    if (phaseChanged) {
      flush()
      return
    }

    if (Date.now() - lastEmit >= intervalMs) {
      flush()
      return
    }

    if (!timer) {
      timer = setTimeout(() => {
        timer = null
        flush()
      }, intervalMs)
    }
  }

  throttled.flush = flush
  return throttled
}

export function formatProgressFraction(params: { current: number; total: number }) {
  const { current, total } = params
  if (total <= 0) return `${current.toLocaleString()}`
  const pct = Math.min(100, Math.round((current / total) * 100))
  return `${current.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`
}
