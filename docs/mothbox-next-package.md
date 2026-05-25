# Mothbox Next dataset package

The app opens **finished** Mothbox Next packages only. Legacy Dinalab trees (`dataset/deployment/night/patches`) must be converted with an external adapter first.

## Layout

| Path | Role |
|------|------|
| `dataset.json` | Manifest (`format: mothbox-next-dataset`) |
| `00_source/` | Optional — user can put legacy source here for a tidier folder |
| `01_patches/` | Canonical patch images (`asset_path` in records) |
| `02_records/` | NDJSON: `patches`, `patch-sources`, `deployments`, `camera-days`, derived `current-classifications` |
| `03_classifications/` | Per-classifier claim files (`_bot.ndjson`, `{id}.ndjson`) |
| `04_exports/` | Optional export output |

## Load rule

On open, the app **always resolves** `current-classifications` from every file in `03_classifications/` (latest `classified_at` wins). The file `02_records/current-classifications.ndjson` is a **cache** rewritten on save/import, not authoritative on load.

## Convert legacy data

**In the app (recommended):**

1. **Choose datasets folder…** — parent that will hold **all** packages (e.g. `~/Mothbox/datasets/`).
2. **Drag and drop** a legacy dataset folder (or an existing package) into that folder in Finder.
3. **Reload** the app or click **Refresh datasets**. Folders without `dataset.json` are set up in place (legacy files stay where you dropped them; paths are written into `02_records/`). Optionally move legacy into `00_source/` yourself first for a neater layout.
4. Drop new deployment folders into an open package later — when you return to the app, you are prompted to merge them.

**CLI (optional):**

```bash
bun run adapters/dinalab-mothbox-v1/adapter.ts <dataset-folder>
```

CLI expects `<dataset-folder>/00_source/` with the same night/bot/patch layout.

## Verification

```bash
bun run verify:mothbox-next
bun run verify:mothbox-next --phase=5
```

Results are written to `verify-report.json` at the repo root.

## Entity bridge

| Package | App store |
|---------|-----------|
| `patch_id` | `DetectionEntity.id` / `PatchEntity.id` |
| `camera_day_id` | `nightId` |
| `patch-sources.source_photo_id` | synthetic `photoId` (`{id}.jpg`) |
| `deployments` / `camera-days` | project / site / deployment / night hierarchy (legacy stores) |

## Hierarchy manifest (v3)

`dataset.json` may include a `hierarchy` block declaring in-package grouping levels (dataset itself is implicit). Adapters write v3 manifests with `hierarchy`; v2 packages infer Dinalab deployment + night on load.

Patch-image-only datasets use one synthetic leaf: `camera_day_id = "{dataset_id}__default"`.

Navigation (breadcrumbs, home tree) reads resolved hierarchy nodes from the manifest. Classification still keys off the leaf id (`camera_day_id` / `nightId`).

## Collaboration

Drop or import a classifier file into `03_classifications/{id}.ndjson`. Import replaces that file, re-runs the resolver, and refreshes stores.

## Legacy ingest flag

`src/config/ingest.ts` → `legacyIngestEnabled`. Set to `false` after production validation to require packages only.
