#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

type LayerResult = {
  layer: string
  status: 'pass' | 'fail' | 'skip'
  durationMs: number
  message?: string
}

const phaseArg = process.argv.find((a) => a.startsWith('--phase='))
const maxPhase = phaseArg ? Number(phaseArg.split('=')[1]) : 7

const layers: Array<{ id: string; phase: number; run: () => LayerResult | Promise<LayerResult> }> = [
  { id: 'L0', phase: 1, run: runVitestFilter('validate-dataset-package') },
  { id: 'L1', phase: 3, run: runVitestFilter('resolve-classifications') },
  { id: 'L2', phase: 2, run: runAdapterLayer },
  { id: 'L3', phase: 4, run: runVitestFilter('ingest-package') },
  { id: 'L4', phase: 5, run: runVitestFilter('persist-round-trip') },
  { id: 'L5', phase: 6, run: runVitestFilter('import-classifications') },
  { id: 'L6', phase: 7, run: runVitestFilter('package-export') },
]

async function main() {
  const results: LayerResult[] = []
  let failed = false

  for (const layer of layers) {
    if (layer.phase > maxPhase) continue
    const start = performance.now()
    const result = await layer.run()
    result.durationMs = Math.round(performance.now() - start)
    results.push(result)
    if (result.status === 'fail') failed = true
  }

  const report = {
    status: failed ? 'fail' : 'pass',
    maxPhase,
    results,
    finishedAt: new Date().toISOString(),
  }

  const reportPath = path.join(process.cwd(), 'verify-report.json')
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify(report, null, 2))
  process.exit(failed ? 1 : 0)
}

function runVitestFilter(name: string): () => LayerResult {
  return () => {
    const testPath = `src/features/mothbox-next/__tests__/${name}.test.ts`
    const proc = spawnSync('bun', ['run', 'test', testPath], {
      stdio: 'pipe',
      encoding: 'utf8',
      cwd: process.cwd(),
    })
    if (proc.status === 0) {
      return { layer: name, status: 'pass', durationMs: 0 }
    }
    return {
      layer: name,
      status: 'fail',
      durationMs: 0,
      message: proc.stderr || proc.stdout || `vitest failed for ${testPath}`,
    }
  }
}

function runAdapterLayer(): LayerResult {
  const miniSource = path.join(
    process.cwd(),
    'src/features/mothbox-next/__tests__/fixtures/source-dinacon-mini',
  )
  try {
    const stat = require('node:fs').statSync(miniSource)
    if (!stat.isDirectory()) {
      return { layer: 'L2', status: 'skip', durationMs: 0, message: 'source-dinacon-mini fixture not present' }
    }
  } catch {
    return { layer: 'L2', status: 'skip', durationMs: 0, message: 'source-dinacon-mini fixture not present' }
  }

  const proc = spawnSync('bun', ['run', 'adapters/dinalab-mothbox-v1/adapter.ts', miniSource], {
    stdio: 'pipe',
    encoding: 'utf8',
  })
  if (proc.status !== 0) {
    return { layer: 'L2', status: 'fail', durationMs: 0, message: proc.stderr || proc.stdout }
  }

  const validator = path.join(process.env.HOME || '', '.agents/skills/dataset-adapter/scripts/validate_adapter_output.py')
  const py = spawnSync('python3', [validator, miniSource], { stdio: 'pipe', encoding: 'utf8' })
  if (py.status !== 0) {
    return { layer: 'L2', status: 'fail', durationMs: 0, message: py.stderr || py.stdout }
  }

  return { layer: 'L2', status: 'pass', durationMs: 0 }
}

main()
