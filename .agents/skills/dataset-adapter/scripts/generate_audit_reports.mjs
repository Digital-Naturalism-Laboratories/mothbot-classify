#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_MAX_TREE_DEPTH = 4

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.root && args.packages.length === 0) {
    throw new Error('Usage: generate_audit_reports.mjs --root <folder> [--out <output-folder>] [--package <package-root>...]')
  }

  const root = args.root ? path.resolve(args.root) : process.cwd()
  const outDir = path.resolve(args.out ?? path.join(process.cwd(), '.dataset-adapter-audit', timestampSlug()))
  const packageRoots = args.packages.length
    ? args.packages.map((item) => path.resolve(item))
    : await discoverPackageRoots(root)

  await mkdir(outDir, { recursive: true })

  const reports = []
  for (let index = 0; index < packageRoots.length; index++) {
    const packageRoot = packageRoots[index]
    const report = await buildPackageAudit({ packageRoot, root, maxTreeDepth: args.maxTreeDepth })
    const folderName = `${String(index + 1).padStart(2, '0')}-${slugify(report.relativePath || report.datasetId)}`
    const reportDir = path.join(outDir, folderName)
    await mkdir(reportDir, { recursive: true })

    report.outputFolder = folderName
    await writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8')
    await writeFile(path.join(reportDir, 'report.md'), renderMarkdownReport(report), 'utf8')
    await writeFile(path.join(reportDir, 'report.html'), renderHtmlReport(report), 'utf8')
    await writeFile(path.join(reportDir, 'screenshot.svg'), renderSvgScreenshot(report), 'utf8')
    await renderPng(path.join(reportDir, 'screenshot.svg'), path.join(reportDir, 'screenshot.png'))

    reports.push(report)
  }

  await writeFile(path.join(outDir, 'index.md'), renderIndexMarkdown({ root, outDir, reports }), 'utf8')
  await writeFile(path.join(outDir, 'index.html'), renderIndexHtml({ root, reports }), 'utf8')
  await writeFile(path.join(outDir, 'review.md'), renderReviewMarkdown({ root, reports }), 'utf8')
  await renderContactSheet({
    reports,
    outDir,
    outputPath: path.join(outDir, 'contact-sheet.png'),
  })

  console.log(JSON.stringify({
    status: 'pass',
    root,
    outDir,
    packages: reports.length,
    flagged: reports.filter((report) => report.flags.length > 0).length,
  }, null, 2))
}

function parseArgs(argv) {
  const args = {
    root: '',
    out: '',
    packages: [],
    maxTreeDepth: DEFAULT_MAX_TREE_DEPTH,
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--root') args.root = argv[++index] ?? ''
    else if (arg === '--out') args.out = argv[++index] ?? ''
    else if (arg === '--package') args.packages.push(argv[++index] ?? '')
    else if (arg === '--max-depth') args.maxTreeDepth = Number(argv[++index] ?? DEFAULT_MAX_TREE_DEPTH)
    else if (!arg.startsWith('--')) args.packages.push(arg)
    else throw new Error(`Unknown argument: ${arg}`)
  }

  args.packages = args.packages.filter(Boolean)
  if (!Number.isFinite(args.maxTreeDepth) || args.maxTreeDepth < 1) args.maxTreeDepth = DEFAULT_MAX_TREE_DEPTH
  return args
}

async function discoverPackageRoots(root) {
  const out = []

  async function walk(current) {
    if (path.basename(current) === '.dataset-adapter-audit') return
    if (existsSync(path.join(current, 'dataset.json'))) {
      out.push(current)
      return
    }

    let entries = []
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      await walk(path.join(current, entry.name))
    }
  }

  await walk(root)
  return out.sort((a, b) => a.localeCompare(b))
}

async function buildPackageAudit(params) {
  const { packageRoot, root, maxTreeDepth } = params
  const manifest = await readJson(path.join(packageRoot, 'dataset.json'))
  const datasetId = stringValue(manifest.dataset_id) || path.basename(packageRoot)
  const records = objectValue(manifest.records)
  const folders = objectValue(manifest.folders)

  const patches = await readNdjsonIfExists(path.join(packageRoot, manifestPath(records.patches, '02_records/patches.ndjson')))
  const patchSources = await readNdjsonIfExists(path.join(packageRoot, manifestPath(records.patch_sources, '02_records/patch-sources.ndjson')))
  const deployments = await readNdjsonIfExists(path.join(packageRoot, manifestPath(records.deployments, '02_records/deployments.ndjson')))
  const cameraDays = await readNdjsonIfExists(path.join(packageRoot, manifestPath(records.camera_days, '02_records/camera-days.ndjson')))
  const currentClassifications = await readNdjsonIfExists(path.join(packageRoot, manifestPath(records.current_classifications, '02_records/current-classifications.ndjson')))
  const classificationDir = trimSlashes(stringValue(folders.classifications) || '03_classifications')
  const classificationFiles = await readClassificationFiles(packageRoot, classificationDir)

  const patchIds = new Set()
  const duplicatePatchIds = []
  for (const patch of patches) {
    const patchId = stringValue(patch.patch_id)
    if (!patchId) continue
    if (patchIds.has(patchId)) duplicatePatchIds.push(patchId)
    patchIds.add(patchId)
  }

  const patchSourcesByPatchId = new Map()
  for (const row of patchSources) {
    const patchId = stringValue(row.patch_id)
    if (patchId) patchSourcesByPatchId.set(patchId, row)
  }

  const currentByPatchId = new Map()
  for (const row of currentClassifications) {
    const patchId = stringValue(row.patch_id)
    if (patchId) currentByPatchId.set(patchId, row)
  }

  const deploymentStats = buildDeploymentStats({ patches, deployments, currentByPatchId })
  const cameraDayStats = buildCameraDayStats({ patches, cameraDays, currentByPatchId })
  const allClassificationRows = classificationFiles.flatMap((file) => file.rows)

  const manifestClassificationSources = Array.isArray(manifest.classification_sources)
    ? manifest.classification_sources.map((item) => String(item))
    : []
  const actualClassificationSources = classificationFiles.map((file) => file.relativePath)
  const missingManifestClassificationSources = actualClassificationSources.filter((item) => !manifestClassificationSources.includes(item))

  const missingAssetSamples = []
  for (const patch of patches) {
    if (missingAssetSamples.length >= 10) break
    const assetPath = stringValue(patch.asset_path)
    if (assetPath && !existsSync(path.join(packageRoot, trimSlashes(assetPath)))) {
      missingAssetSamples.push(assetPath)
    }
  }

  const classificationUnknownPatchIds = uniqueSorted(
    allClassificationRows
      .map((row) => stringValue(row.patch_id))
      .filter((patchId) => patchId && !patchIds.has(patchId)),
  )
  const currentUnknownPatchIds = uniqueSorted(
    currentClassifications
      .map((row) => stringValue(row.patch_id))
      .filter((patchId) => patchId && !patchIds.has(patchId)),
  )
  const patchIdsMissingSources = [...patchIds].filter((patchId) => !patchSourcesByPatchId.has(patchId)).sort()

  const deploymentIds = new Set(deployments.map((row) => stringValue(row.deployment_id)).filter(Boolean))
  const cameraDayIds = new Set(cameraDays.map((row) => stringValue(row.camera_day_id)).filter(Boolean))
  const missingDeploymentRecords = uniqueSorted(
    patches
      .map((row) => stringValue(row.deployment_id))
      .filter((deploymentId) => deploymentId && !deploymentIds.has(deploymentId)),
  )
  const missingCameraDayRecords = uniqueSorted(
    patches
      .map((row) => stringValue(row.camera_day_id))
      .filter((cameraDayId) => cameraDayId && !cameraDayIds.has(cameraDayId)),
  )

  const flags = []
  if (duplicatePatchIds.length) flags.push(`Duplicate patch_id values: ${duplicatePatchIds.slice(0, 5).join(', ')}`)
  if (patchIdsMissingSources.length) flags.push(`${patchIdsMissingSources.length} patch(es) are missing patch-source rows`)
  if (classificationUnknownPatchIds.length) flags.push(`${classificationUnknownPatchIds.length} classification row patch_id value(s) are unknown`)
  if (currentUnknownPatchIds.length) flags.push(`${currentUnknownPatchIds.length} current classification patch_id value(s) are unknown`)
  if (missingDeploymentRecords.length) flags.push(`${missingDeploymentRecords.length} deployment reference(s) have no deployment record`)
  if (missingCameraDayRecords.length) flags.push(`${missingCameraDayRecords.length} camera-day reference(s) have no camera-day record`)
  if (missingAssetSamples.length) flags.push(`Missing patch asset samples: ${missingAssetSamples.join(', ')}`)
  if (missingManifestClassificationSources.length) {
    flags.push(`Classification files not listed in manifest.classification_sources: ${missingManifestClassificationSources.join(', ')}`)
  }
  const placeholderDeployments = [...deploymentStats.values()]
    .map((item) => item.deploymentId)
    .filter((deploymentId) => deploymentId.includes('{') || deploymentId.includes('}'))
  if (placeholderDeployments.length) flags.push(`Placeholder-looking deployment id(s): ${placeholderDeployments.join(', ')}`)
  if (allClassificationRows.length > 0 && currentClassifications.length !== patches.length) {
    flags.push(`Current classifications (${currentClassifications.length}) do not match patch count (${patches.length}) even though classification rows exist`)
  }

  const deploymentRows = [...deploymentStats.values()].sort((a, b) => b.patchCount - a.patchCount || a.deploymentId.localeCompare(b.deploymentId))
  const cameraDayRows = [...cameraDayStats.values()].sort((a, b) => b.patchCount - a.patchCount || a.cameraDayId.localeCompare(b.cameraDayId))
  const hierarchyNodes = buildHierarchyNodes({
    datasetId,
    counts: {
      patches: patches.length,
      deployments: deployments.length,
      cameraDays: cameraDays.length,
    },
    deployments: deploymentRows,
    cameraDays: cameraDayRows,
  })

  return {
    datasetId,
    packageRoot,
    relativePath: path.relative(root, packageRoot) || path.basename(packageRoot),
    manifest: {
      version: manifest.version,
      package_kind: manifest.package_kind,
      adapter_id: manifest.adapter_id,
      source: manifest.source ?? null,
      hierarchy: manifest.hierarchy ?? null,
      classification_sources: manifestClassificationSources,
    },
    counts: {
      patches: patches.length,
      patchSources: patchSources.length,
      deployments: deployments.length,
      cameraDays: cameraDays.length,
      classificationFiles: classificationFiles.length,
      classificationRows: allClassificationRows.length,
      currentClassifications: currentClassifications.length,
      missingAssets: missingAssetSamples.length,
    },
    hierarchyNodes,
    hierarchyTree: hierarchyNodes.map(formatHierarchyNode),
    deployments: deploymentRows,
    cameraDays: cameraDayRows,
    terms: topCounter(countTerms(currentClassifications.length ? currentClassifications : allClassificationRows), 30),
    termRanks: rankTermCounters(currentClassifications.length ? currentClassifications : allClassificationRows),
    classifiers: topCounter(countBy(allClassificationRows, (row) => stringValue(row.classifier_id) || '(missing)'), 20),
    classifierTypes: topCounter(countBy(allClassificationRows, (row) => stringValue(row.classifier_type) || '(missing)'), 20),
    classificationTypes: topCounter(countBy(allClassificationRows, (row) => stringValue(row.classification_type) || '(missing)'), 20),
    sourceTypes: topCounter(countBy(patchSources, (row) => stringValue(row.source_type) || '(missing)'), 20),
    assetExtensions: topCounter(countBy(patches, (row) => path.extname(stringValue(row.asset_path)).toLowerCase() || '(none)'), 20),
    assetTree: treeLines(buildPathTree(patches.map((row) => stringValue(row.asset_path)).filter(Boolean), maxTreeDepth)),
    originalPatchTree: treeLines(buildPathTree(patchSources.map((row) => stringValue(row.original_patch_path)).filter(Boolean), maxTreeDepth)),
    originalBotTree: treeLines(buildPathTree(patchSources.map((row) => stringValue(row.original_bot_detection_path)).filter(Boolean), maxTreeDepth)),
    classificationFiles: classificationFiles.map((file) => ({
      path: file.relativePath,
      rows: file.rows.length,
      unknownPatchIds: file.rows.filter((row) => !patchIds.has(stringValue(row.patch_id))).length,
    })),
    flags,
    status: flags.length ? 'check' : 'ok',
  }
}

function buildDeploymentStats(params) {
  const { patches, deployments, currentByPatchId } = params
  const deploymentMeta = new Map(deployments.map((row) => [stringValue(row.deployment_id), row]))
  const stats = new Map()

  for (const patch of patches) {
    const deploymentId = stringValue(patch.deployment_id) || '(none)'
    const cameraDayId = stringValue(patch.camera_day_id) || '(none)'
    const meta = deploymentMeta.get(deploymentId) ?? {}
    if (!stats.has(deploymentId)) {
      stats.set(deploymentId, {
        deploymentId,
        site: stringValue(meta.site_name_from_folder) || stringValue(meta.site_id) || '',
        device: stringValue(meta.device_id_from_folder) || stringValue(meta.device_id) || '',
        deploymentDate: stringValue(meta.deployment_start_from_folder) || '',
        datasetFromFolder: stringValue(meta.dataset_name_from_folder) || '',
        patchCount: 0,
        cameraDays: new Set(),
        currentClassifications: 0,
        topTerms: new Map(),
      })
    }
    const item = stats.get(deploymentId)
    item.patchCount += 1
    if (cameraDayId) item.cameraDays.add(cameraDayId)
    const current = currentByPatchId.get(stringValue(patch.patch_id))
    if (current) {
      item.currentClassifications += 1
      const term = primaryTerm(current)
      item.topTerms.set(term, (item.topTerms.get(term) ?? 0) + 1)
    }
  }

  for (const item of stats.values()) {
    item.cameraDayCount = item.cameraDays.size
    item.topTerms = topCounter(item.topTerms, 5)
    delete item.cameraDays
  }
  return stats
}

function buildCameraDayStats(params) {
  const { patches, cameraDays, currentByPatchId } = params
  const cameraMeta = new Map(cameraDays.map((row) => [stringValue(row.camera_day_id), row]))
  const stats = new Map()

  for (const patch of patches) {
    const cameraDayId = stringValue(patch.camera_day_id) || '(none)'
    const meta = cameraMeta.get(cameraDayId) ?? {}
    if (!stats.has(cameraDayId)) {
      stats.set(cameraDayId, {
        cameraDayId,
        deploymentId: stringValue(meta.deployment_id) || stringValue(patch.deployment_id) || '',
        nightDate: stringValue(meta.night_date) || '',
        patchCount: 0,
        currentClassifications: 0,
        topTerms: new Map(),
      })
    }
    const item = stats.get(cameraDayId)
    item.patchCount += 1
    const current = currentByPatchId.get(stringValue(patch.patch_id))
    if (current) {
      item.currentClassifications += 1
      const term = primaryTerm(current)
      item.topTerms.set(term, (item.topTerms.get(term) ?? 0) + 1)
    }
  }

  for (const item of stats.values()) {
    item.topTerms = topCounter(item.topTerms, 5)
  }
  return stats
}

function buildHierarchyNodes(params) {
  const { datasetId, counts, deployments, cameraDays } = params
  const nodes = [
    {
      depth: 0,
      type: 'dataset',
      label: datasetId,
      detail: `${counts.patches.toLocaleString()} patches | ${counts.deployments.toLocaleString()} deployments | ${counts.cameraDays.toLocaleString()} nights`,
    },
  ]

  for (const deployment of deployments) {
    const deploymentLabel = deployment.deploymentId === '(none)' ? 'Flat / no deployment record' : deployment.deploymentId
    const meta = [deployment.site ? `site ${deployment.site}` : '', deployment.device ? `device ${deployment.device}` : '']
      .filter(Boolean)
      .join(' | ')
    nodes.push({
      depth: 1,
      type: deployment.deploymentId.includes('{') || deployment.deploymentId.includes('}') ? 'deployment-warning' : 'deployment',
      label: deploymentLabel,
      detail: `${deployment.patchCount.toLocaleString()} patches | ${deployment.cameraDayCount.toLocaleString()} nights${meta ? ` | ${meta}` : ''}`,
    })

    const children = cameraDays
      .filter((cameraDay) => (cameraDay.deploymentId || '(none)') === deployment.deploymentId)
      .sort((a, b) => (a.nightDate || a.cameraDayId).localeCompare(b.nightDate || b.cameraDayId))

    for (const cameraDay of children) {
      nodes.push({
        depth: 2,
        type: 'camera-day',
        label: cameraDay.nightDate || cameraDay.cameraDayId,
        detail: `${cameraDay.patchCount.toLocaleString()} patches${cameraDay.currentClassifications ? ` | ${cameraDay.currentClassifications.toLocaleString()} current` : ''}${cameraDay.topTerms.length ? ` | ${termsInline(cameraDay.topTerms.slice(0, 3))}` : ''}`,
      })
    }
  }

  return nodes
}

function formatHierarchyNode(node) {
  const prefix = node.depth === 0 ? '' : `${'  '.repeat(node.depth - 1)}${node.depth === 1 ? '- ' : '  - '}`
  return `${prefix}${node.label} (${node.detail})`
}

async function readClassificationFiles(packageRoot, classificationDir) {
  const absoluteDir = path.join(packageRoot, classificationDir)
  let entries = []
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true })
  } catch {
    return []
  }

  const files = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ndjson')) continue
    const relativePath = `${classificationDir.replace(/\/+$/, '')}/${entry.name}`
    files.push({
      relativePath,
      rows: await readNdjsonIfExists(path.join(packageRoot, relativePath)),
    })
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function readNdjsonIfExists(filePath) {
  if (!existsSync(filePath)) return []
  const text = await readFile(filePath, 'utf8')
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function manifestPath(value, fallback) {
  return trimSlashes(stringValue(value) || fallback)
}

function countBy(rows, getKey) {
  const counter = new Map()
  for (const row of rows) {
    const key = getKey(row)
    counter.set(key, (counter.get(key) ?? 0) + 1)
  }
  return counter
}

function countTerms(rows) {
  const counter = new Map()
  for (const row of rows) {
    const term = primaryTerm(row)
    counter.set(term, (counter.get(term) ?? 0) + 1)
  }
  return counter
}

function rankTermCounters(rows) {
  const ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species', 'label', 'morphospecies']
  const out = {}
  for (const rank of ranks) out[rank] = new Map()

  for (const row of rows) {
    const taxon = objectValue(row.taxon)
    for (const rank of ranks) {
      const value = rank === 'label' || rank === 'morphospecies' ? stringValue(row[rank]) : stringValue(taxon[rank])
      if (!value) continue
      out[rank].set(value, (out[rank].get(value) ?? 0) + 1)
    }
  }

  return Object.fromEntries(Object.entries(out).map(([rank, counter]) => [rank, topCounter(counter, 12)]))
}

function primaryTerm(row) {
  const taxon = objectValue(row.taxon)
  return (
    stringValue(row.morphospecies) ||
    stringValue(taxon.species) ||
    stringValue(taxon.genus) ||
    stringValue(taxon.family) ||
    stringValue(taxon.order) ||
    stringValue(row.label) ||
    stringValue(row.classification_type) ||
    '(unclassified)'
  )
}

function topCounter(counter, limit) {
  return [...counter.entries()]
    .map(([term, count]) => ({ term: String(term), count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit)
}

function buildPathTree(paths, maxDepth) {
  const root = { count: 0, children: new Map() }
  for (const rawPath of paths) {
    let parts = trimSlashes(rawPath).split('/').filter(Boolean)
    if (parts.length && looksLikeFileName(parts[parts.length - 1])) parts = parts.slice(0, -1)
    if (!parts.length) parts = ['(root)']
    parts = parts.slice(0, maxDepth)
    let current = root
    current.count += 1
    for (const part of parts) {
      if (!current.children.has(part)) current.children.set(part, { count: 0, children: new Map() })
      current = current.children.get(part)
      current.count += 1
    }
  }
  return root
}

function looksLikeFileName(value) {
  return /\.[A-Za-z0-9]{1,8}$/.test(String(value ?? ''))
}

function treeLines(tree, indent = 0) {
  const lines = []
  const entries = [...tree.children.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
  for (const [name, node] of entries) {
    lines.push(`${'  '.repeat(indent)}- ${name}/ (${node.count})`)
    lines.push(...treeLines(node, indent + 1))
  }
  return lines
}

function renderMarkdownReport(report) {
  return `# Dataset Audit: ${report.datasetId}

Path: \`${report.packageRoot}\`  
Relative path: \`${report.relativePath}\`  
Status: **${report.status}**

## Counts

| Metric | Count |
| --- | ---: |
${Object.entries(report.counts).map(([key, value]) => `| ${key} | ${value.toLocaleString()} |`).join('\n')}

## Hierarchy Tree

\`\`\`text
${report.hierarchyTree.join('\n') || '(none)'}
\`\`\`

## Deployments

${markdownTable(['Deployment', 'Site', 'Device', 'Nights', 'Patches', 'Current', 'Top terms'], report.deployments.map((item) => [
  item.deploymentId,
  item.site,
  item.device,
  item.cameraDayCount,
  item.patchCount,
  item.currentClassifications,
  termsInline(item.topTerms),
]))}

## Camera Days / Nights

${markdownTable(['Camera day', 'Deployment', 'Night date', 'Patches', 'Current', 'Top terms'], report.cameraDays.map((item) => [
  item.cameraDayId,
  item.deploymentId,
  item.nightDate,
  item.patchCount,
  item.currentClassifications,
  termsInline(item.topTerms),
]))}

## Terms

${markdownTable(['Term', 'Count'], report.terms.map((item) => [item.term, item.count]))}

## Classification Files

${markdownTable(['File', 'Rows', 'Unknown patch ids'], report.classificationFiles.map((item) => [item.path, item.rows, item.unknownPatchIds]))}

## Source Types

${markdownTable(['Source type', 'Count'], report.sourceTypes.map((item) => [item.term, item.count]))}

## Asset Folder Tree

\`\`\`text
${report.assetTree.slice(0, 80).join('\n') || '(none)'}
\`\`\`

## Original Patch Folder Tree

\`\`\`text
${report.originalPatchTree.slice(0, 80).join('\n') || '(none)'}
\`\`\`

## Flags

${report.flags.length ? report.flags.map((flag) => `- ${flag}`).join('\n') : '- None'}
`
}

function renderIndexMarkdown(params) {
  const { root, outDir, reports } = params
  return `# Dataset Adapter Audit Index

Root: \`${root}\`  
Output: \`${outDir}\`

${markdownTable(['Status', 'Dataset', 'Patches', 'Deployments', 'Nights', 'Terms', 'Report', 'Screenshot'], reports.map((report) => [
  report.status,
  report.relativePath,
  report.counts.patches,
  report.counts.deployments,
  report.counts.cameraDays,
  termsInline(report.terms.slice(0, 3)),
  `${report.outputFolder}/report.md`,
  `${report.outputFolder}/screenshot.png`,
]))}
`
}

function renderReviewMarkdown(params) {
  const { root, reports } = params
  const flagged = reports.filter((report) => report.flags.length > 0)
  const ok = reports.filter((report) => report.flags.length === 0)
  return `# Dataset Adapter Audit Review

Root: \`${root}\`

## High-Level Result

- Packages reviewed: ${reports.length}
- OK: ${ok.length}
- Needs inspection: ${flagged.length}

## Needs Inspection

${flagged.length ? flagged.map((report) => `### ${report.relativePath}

${report.flags.map((flag) => `- ${flag}`).join('\n')}
`).join('\n') : '- None'}

## Reviewed OK

${ok.map((report) => `- ${report.relativePath} (${report.counts.patches.toLocaleString()} patches, ${report.counts.deployments.toLocaleString()} deployments, ${report.counts.cameraDays.toLocaleString()} nights)`).join('\n') || '- None'}
`
}

function renderHtmlReport(report) {
  const rows = (headers, bodyRows) => `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(report.datasetId)} audit</title>
<style>
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f7f7f4;color:#171717}
main{max-width:1180px;margin:0 auto;padding:32px}
h1{font-size:28px;margin:0 0 8px}
h2{font-size:18px;margin:28px 0 10px}
.meta{color:#555;font-size:13px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}
.stat{background:white;border:1px solid #ddd;border-radius:8px;padding:14px}
.stat b{display:block;font-size:24px}
.status{display:inline-block;padding:4px 8px;border-radius:999px;background:${report.status === 'ok' ? '#d7f2df' : '#ffe6c7'};font-weight:600}
table{border-collapse:collapse;width:100%;background:white;border:1px solid #ddd;border-radius:8px;overflow:hidden}
th,td{border-bottom:1px solid #e6e6e0;padding:8px 10px;text-align:left;font-size:13px;vertical-align:top}
th{background:#efefe8;font-weight:700}
pre{background:#1f2520;color:#f3f5ef;border-radius:8px;padding:14px;overflow:auto;font-size:12px}
.flags{background:${report.flags.length ? '#fff5db' : '#e9f7ee'};border:1px solid ${report.flags.length ? '#f0cf7b' : '#b9dfc2'};border-radius:8px;padding:12px}
</style>
</head>
<body><main>
<h1>${escapeHtml(report.datasetId)}</h1>
<div class="meta">${escapeHtml(report.relativePath)} &middot; <span class="status">${escapeHtml(report.status)}</span></div>
<section class="grid">
${stat('Patches', report.counts.patches)}
${stat('Deployments', report.counts.deployments)}
${stat('Nights', report.counts.cameraDays)}
${stat('Current IDs', report.counts.currentClassifications)}
</section>
<h2>Flags</h2>
<div class="flags">${report.flags.length ? `<ul>${report.flags.map((flag) => `<li>${escapeHtml(flag)}</li>`).join('')}</ul>` : 'None'}</div>
<h2>Hierarchy Tree</h2>
<pre>${escapeHtml(report.hierarchyTree.join('\n') || '(none)')}</pre>
<h2>Deployments</h2>
${rows(['Deployment', 'Site', 'Device', 'Nights', 'Patches', 'Top terms'], report.deployments.map((item) => [item.deploymentId, item.site, item.device, item.cameraDayCount, item.patchCount, termsInline(item.topTerms)]))}
<h2>Camera Days / Nights</h2>
${rows(['Camera day', 'Deployment', 'Night date', 'Patches', 'Top terms'], report.cameraDays.map((item) => [item.cameraDayId, item.deploymentId, item.nightDate, item.patchCount, termsInline(item.topTerms)]))}
<h2>Terms</h2>
${rows(['Term', 'Count'], report.terms.map((item) => [item.term, item.count]))}
<h2>Asset Folder Tree</h2>
<pre>${escapeHtml(report.assetTree.slice(0, 100).join('\n') || '(none)')}</pre>
</main></body></html>`
}

function renderIndexHtml(params) {
  const { root, reports } = params
  return `<!doctype html><html><head><meta charset="utf-8"><title>Dataset Adapter Audit</title><style>
body{font-family:Inter,ui-sans-serif,system-ui;margin:32px;background:#f7f7f4;color:#171717}
table{border-collapse:collapse;width:100%;background:white;border:1px solid #ddd}
th,td{border-bottom:1px solid #e6e6e0;padding:8px;text-align:left;font-size:13px}
th{background:#efefe8}
img{width:180px;border:1px solid #ddd;border-radius:6px}
</style></head><body><h1>Dataset Adapter Audit</h1><p>${escapeHtml(root)}</p><table><thead><tr><th>Status</th><th>Dataset</th><th>Counts</th><th>Terms</th><th>Screenshot</th></tr></thead><tbody>${reports.map((report) => `<tr><td>${escapeHtml(report.status)}</td><td><a href="${escapeHtml(report.outputFolder)}/report.html">${escapeHtml(report.relativePath)}</a></td><td>${report.counts.patches.toLocaleString()} patches, ${report.counts.deployments.toLocaleString()} deployments, ${report.counts.cameraDays.toLocaleString()} nights</td><td>${escapeHtml(termsInline(report.terms.slice(0, 5)))}</td><td><img src="${escapeHtml(report.outputFolder)}/screenshot.png"></td></tr>`).join('')}</tbody></table></body></html>`
}

function renderSvgScreenshot(report) {
  const width = 1600
  const height = 1180
  const hierarchyRows = visibleRows(report.hierarchyNodes, 24)
  const folderRows = visibleRows(report.assetTree.map((line) => ({ depth: leadingSpaces(line) / 2, label: line.trim(), detail: '' })), 12)
  const topTerms = report.terms.slice(0, 8)
  const flagLines = report.flags.length
    ? [...report.flags.slice(0, 2), ...(report.flags.length > 2 ? [`${report.flags.length - 2} more flag(s)`] : [])]
    : ['No structural flags detected']

  const hierarchySvg = hierarchyRows.map((node, index) => renderHierarchySvgRow({ node, index, x: 88, y: 392 })).join('')
  const folderSvg = folderRows.map((node, index) => renderFolderSvgRow({ node, index, x: 1118, y: 392 })).join('')
  const termRows = topTerms.map((item, index) => textLine(1120, 750 + index * 29, `${item.term}: ${item.count.toLocaleString()}`, 18, '#1e2520', 400, 40))
  const flags = flagLines.map((flag, index) => textLine(112, 1060 + index * 27, `- ${flag}`, 18, report.flags.length ? '#5a3300' : '#124427', 400, 112))

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="1600" height="1180" fill="#f7f7f4"/>
<rect x="48" y="42" width="1504" height="1096" rx="24" fill="#ffffff" stroke="#d9d8ce"/>
${textLine(86, 104, report.datasetId, 38, '#111611', 700, 48)}
${textLine(88, 142, report.relativePath, 20, '#5b6058', 400, 100)}
<rect x="88" y="168" width="${report.status === 'ok' ? 92 : 132}" height="34" rx="17" fill="${report.status === 'ok' ? '#d7f2df' : '#ffe6c7'}"/>
${textLine(110, 192, report.status.toUpperCase(), 18, report.status === 'ok' ? '#124427' : '#5a3300', 700, 14)}
${statSvg(88, 226, 'Patches', report.counts.patches)}
${statSvg(328, 226, 'Deployments', report.counts.deployments)}
${statSvg(568, 226, 'Nights', report.counts.cameraDays)}
${statSvg(808, 226, 'Current IDs', report.counts.currentClassifications)}
<rect x="72" y="322" width="1006" height="660" rx="18" fill="#fbfbf7" stroke="#e0dfd5"/>
<rect x="1100" y="322" width="408" height="660" rx="18" fill="#fbfbf7" stroke="#e0dfd5"/>
${textLine(88, 358, 'Hierarchy: dataset -> deployment -> night', 23, '#111611', 700, 60)}
${textLine(1118, 358, 'Folder path structure', 23, '#111611', 700, 30)}
${hierarchySvg}
${folderSvg}
${textLine(1118, 716, 'Top terms', 22, '#111611', 700, 30)}
${termRows.join('')}
<rect x="72" y="1004" width="1436" height="114" rx="18" fill="${report.flags.length ? '#fff8e8' : '#edf8ef'}" stroke="${report.flags.length ? '#f0cf7b' : '#b9dfc2'}"/>
${textLine(88, 1034, 'Review flags', 23, '#111611', 700, 60)}
${flags.join('')}
</svg>`
}

function visibleRows(rows, limit) {
  if (rows.length <= limit) return rows
  return [...rows.slice(0, limit - 1), { depth: 0, type: 'more', label: `${rows.length - limit + 1} more row(s)`, detail: '' }]
}

function renderHierarchySvgRow(params) {
  const { node, index, x, y } = params
  const rowY = y + index * 25
  const indent = Math.min(node.depth, 3) * 30
  const rowX = x + indent
  const isDataset = node.type === 'dataset'
  const isDeployment = node.type === 'deployment' || node.type === 'deployment-warning'
  const fill = node.type === 'deployment-warning' ? '#fff3d6' : isDataset ? '#eef6ef' : isDeployment ? '#f1f1ea' : 'transparent'
  const stroke = node.type === 'deployment-warning' ? '#e2b75a' : isDataset ? '#cce7d2' : isDeployment ? '#dfded4' : 'transparent'
  const labelColor = node.type === 'deployment-warning' ? '#5a3300' : '#1e2520'
  const labelWeight = isDataset || isDeployment ? 700 : 500
  const labelSize = isDataset ? 19 : isDeployment ? 18 : 16
  const branch = node.depth === 0 ? '' : node.depth === 1 ? '+ ' : '|-- '
  const rowBg = fill === 'transparent' ? '' : `<rect x="${rowX - 8}" y="${rowY - 18}" width="${968 - indent}" height="24" rx="8" fill="${fill}" stroke="${stroke}"/>`
  const connector = node.depth > 0 ? `<line x1="${x + indent - 18}" y1="${rowY - 16}" x2="${x + indent - 18}" y2="${rowY + 4}" stroke="#c9c9bd" stroke-width="1.2"/>` : ''

  return `${rowBg}${connector}${textLine(rowX, rowY, `${branch}${node.label}`, labelSize, labelColor, labelWeight, node.depth === 2 ? 44 : 58)}${textLine(720, rowY, node.detail, 15, '#5b6058', 400, 42)}`
}

function renderFolderSvgRow(params) {
  const { node, index, x, y } = params
  const rowY = y + index * 24
  const indent = Math.min(node.depth, 4) * 20
  return textLine(x + indent, rowY, node.label, 16, '#1e2520', 400, Math.max(18, 44 - node.depth * 4), 'JetBrains Mono, Menlo, Consolas, monospace')
}

async function renderPng(svgPath, pngPath) {
  try {
    const sharp = (await import('sharp')).default
    await sharp(svgPath).png().toFile(pngPath)
  } catch (err) {
    console.warn(`Could not render PNG for ${svgPath}: ${String(err)}`)
  }
}

async function renderContactSheet(params) {
  const { reports, outDir, outputPath } = params
  try {
    const sharp = (await import('sharp')).default
    const tileWidth = 760
    const tileHeight = 560
    const gap = 24
    const columns = 2
    const rows = Math.ceil(reports.length / columns)
    const composites = []

    for (let index = 0; index < reports.length; index++) {
      const report = reports[index]
      const input = path.join(outDir, report.outputFolder, 'screenshot.png')
      if (!existsSync(input)) continue
      const buffer = await sharp(input).resize(tileWidth, tileHeight, { fit: 'cover', position: 'top' }).png().toBuffer()
      composites.push({
        input: buffer,
        left: gap + (index % columns) * (tileWidth + gap),
        top: gap + Math.floor(index / columns) * (tileHeight + gap),
      })
    }

    await sharp({
      create: {
        width: gap + columns * (tileWidth + gap),
        height: gap + rows * (tileHeight + gap),
        channels: 4,
        background: '#f7f7f4',
      },
    }).composite(composites).png().toFile(outputPath)
  } catch (err) {
    console.warn(`Could not render contact sheet: ${String(err)}`)
  }
}

function stat(label, value) {
  return `<div class="stat"><span>${escapeHtml(label)}</span><b>${Number(value).toLocaleString()}</b></div>`
}

function statSvg(x, y, label, value) {
  return `<rect x="${x}" y="${y}" width="214" height="76" rx="12" fill="#f4f4ee" stroke="#ddddd2"/>
${textLine(x + 20, y + 26, label, 15, '#5b6058', 700, 20)}
${textLine(x + 20, y + 59, Number(value).toLocaleString(), 28, '#111611', 700, 12)}`
}

function textLine(x, y, text, size, fill, weight = 400, maxLength = 92, fontFamily = 'Inter, Arial, sans-serif') {
  return `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(truncateText(String(text), maxLength))}</text>`
}

function markdownTable(headers, rows) {
  if (!rows.length) return '_None_'
  const header = `| ${headers.join(' | ')} |`
  const divider = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${row.map((cell) => String(cell ?? '').replaceAll('|', '\\|')).join(' | ')} |`)
  return [header, divider, ...body].join('\n')
}

function termsInline(items) {
  if (!items || !items.length) return ''
  return items.slice(0, 5).map((item) => `${item.term} (${item.count.toLocaleString()})`).join(', ')
}

function leadingSpaces(value) {
  const match = String(value ?? '').match(/^ */)
  return match ? match[0].length : 0
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort()
}

function trimSlashes(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'dataset'
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeXml(value) {
  return escapeHtml(value)
}

function truncateText(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
