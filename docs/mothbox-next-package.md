# Mothbox Next dataset package

The app opens **finished** Mothbox Next packages only. Legacy Dinalab trees (`dataset/deployment/night/patches`) must be converted with an external adapter first.

## Layout

| Path | Role |
|------|------|
| `dataset.json` | Manifest (`format: mothbox-next-dataset`) |
| `00_source/` | Optional raw photos + bot JSON (adapter input) |
| `01_patches/` | Canonical patch images (`asset_path` in records) |
| `02_records/` | NDJSON: `patches`, `patch-sources`, `deployments`, `camera-days`, derived `current-classifications` |
| `03_classifications/` | Per-classifier claim files (`_bot.ndjson`, `{id}.ndjson`) |
| `04_exports/` | Optional export output |

## Load rule

On open, the app **always resolves** `current-classifications` from every file in `03_classifications/` (latest `classified_at` wins). The file `02_records/current-classifications.ndjson` is a **cache** rewritten on save/import, not authoritative on load.

## Convert legacy data

**In the app (recommended):** Home nav, two steps:

1. **Choose datasets folder…** — parent that will hold **all** packages (e.g. `~/Mothbox/datasets/`). Saved for later migrations.
2. **Migrate legacy dataset…** — pick **one** old dataset folder (bot JSON + `patches/` per night). The app creates `datasets/<legacy-folder-name>/` with `00_source/` (archive of the legacy tree), `01_patches/`, records, classifications, and `dataset.json`, then opens that package. The original folder is left in place.

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
| `deployments` / `camera-days` | project / site / deployment / night hierarchy |

## Collaboration

Drop or import a classifier file into `03_classifications/{id}.ndjson`. Import replaces that file, re-runs the resolver, and refreshes stores.

## Legacy ingest flag

`src/config/ingest.ts` → `legacyIngestEnabled`. Set to `false` after production validation to require packages only.
