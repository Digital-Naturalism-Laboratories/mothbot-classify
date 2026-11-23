# Mothbox Next dataset package

The app opens **finished** Mothbox Next packages only. Legacy Dinalab trees (`dataset/deployment/night/patches`) must be converted with an external adapter first.

## Layout

| Path | Role |
|------|------|
| `dataset.json` | Manifest (`format: mothbox-next-dataset`) |
| `00_source/` | Optional — user can put legacy source here for a tidier folder |
| `01_patches/` | Canonical patch images (`asset_path` in records) |
| `02_records/` | NDJSON: `patches`, `patch-sources`, `deployments`, `camera-days`, derived `current-classifications`, optional `non-target-categories` |
| `03_classifications/` | Per-classifier identification files (`_bot.ndjson`, `{id}.ndjson`), append-only |
| `04_exports/` | Optional export output |

## Load rule

On open, the app **always resolves** the determinations from every file in `03_classifications/`, using the determination algorithm `mothbox-default/1`: the latest human identification wins, else the latest machine identification (see `src/features/mothbox-next/resolver-spec.md`). The file `02_records/current-classifications.ndjson` is a **cache** rewritten on save/import, not authoritative on load.

## Identifications are append-only

Every row in `03_classifications/` is one identification. Classify never rewrites or deletes a row. A changed identification is a new row, and resetting a detection adds a `withdrawn` row. New rows carry:

| Field | Meaning |
|---|---|
| `identification_id` | Stable id (older rows get the derived id `<classifier_id>::<patch_id>`) |
| `occurrence_id` | The occurrence the identification is about (defaults to the patch) |
| `identifier_name` | The person's name as typed: full name or initials |
| `agreed_with` | For an Agree, or a choice from the history: the identification it endorses |
| `withdraws` | On a `withdrawn` row: the identification taken back |

Older Classify builds can still read these files, but they don't understand `withdrawn` rows, and saving from an older build collapses the history to one row per patch.

## Occurrences and Non-Target

- `patches.ndjson` rows may carry `occurrence_id`. New packages write one occurrence per detection (`occurrence_id` = `patch_id`); a missing field means the same.
- Non-Target labels are paths: `NON_TARGET`, `NON_TARGET/Error/Blur`. Older `ERROR` / `ERROR_<reason>` labels are read as Non-Target. Categories people add are appended to `02_records/non-target-categories.ndjson` (camelCase fields: `path`, `addedAt`, `addedBy`).

## Convert legacy data

**In the app (recommended):**

1. **Choose datasets folder…** — parent that will hold **all** packages (e.g. `~/Mothbox/datasets/` on macOS/Linux, `C:\Users\You\Mothbox\datasets\` on Windows).
2. **Copy or move** a legacy dataset folder (or an existing package) into that folder using your file manager (File Explorer, Finder, Files, etc.).
3. **Reload** the app or click **Refresh datasets**. Folders without `dataset.json` are set up in place (legacy files stay where you added them; paths are written into `02_records/`). Optionally move legacy into `00_source/` yourself first for a neater layout.
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

Operator steps (zip, unzip, which files to send back): [`collaboration-handoff.md`](./collaboration-handoff.md).

In the app, dropping a classifier file into `03_classifications/{id}.ndjson` and reopening the dataset reloads classifications. Programmatic import: `importClassifierNdjsonFile` in `src/features/mothbox-next/import-classifications.ts`.

## Legacy ingest flag

`src/config/ingest.ts` → `legacyIngestEnabled`. Set to `false` after production validation to require packages only.
