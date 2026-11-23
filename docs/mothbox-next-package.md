# Mothbox Next dataset package

The app opens **finished** Mothbox Next packages only. Legacy Dinalab trees (`dataset/deployment/night/patches`) must be converted with an external adapter first.

## Layout

| Path | Role |
|------|------|
| `dataset.json` | Manifest (`format: mothbox-next-dataset`) |
| `00_source/` | Optional — user can put legacy source here for a tidier folder |
| `01_patches/` | Canonical patch images (`asset_path` in records) |
| `02_records/` | NDJSON: `patches`, `patch-sources`, `deployments`, `camera-days`, `sessions`, derived `current-classifications`, optional `non-target-categories` |
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

## Sessions, boxes and deployments

- **Sessions** (`02_records/sessions.ndjson`, camelCase): one line per session, `{sessionID, deploymentID, start, end, definedBy, captureWindows: [...]}`. The adapter copies them from Mothbot Process's `_processed/<deployment>/sessions.json`; a deployment without that file gets one default session per night, noon to 11:59:59 the next morning, named like the night. New nights only ever add sessions; existing ones (possibly edited) are never changed.
- **Patches** carry `session_id` and `capture_window_id`, matched by capture time from the file name.
- **Patch sources** carry `crop_box`, a box labelled with its format (`obb-corners-rel` for Mothbox boxes: four corners as fractions of the image size; `xyxy-px` for AMI crops). The pixel `crop_points` stay as before; unlabelled points are X-AnyLabeling pixel corners.
- **Deployments** carry what the detection files say about the device, site and location: `device_name`, `device_type`, `device_type_id`, `firmware_version`, `site_name`, `latitude`, `longitude`, `height_above_ground_m`, `facing_direction`, `attractors`, `target`, `sensor`.

## Field names: package format 4

Packages up to format version 3 are snake_case. Format 4 is camelCase (`patchID`, `identifierType: machine`, `classificationType: nonTarget`), as decided for all files. Classify reads both, refuses packages newer than format 4, and writes each package in its own style. New packages are written as format 4.

When an older package is opened (and Classify has write access), it is converted first, before anything is indexed (`src/features/mothbox-next/migrate-package-to-camel-case.ts`):

1. dataset.json and every `.ndjson` file in `02_records/` and `03_classifications/` are copied to `00_format_backup/format-3-<time>/…​.bak`, and each copy is read back and checked.
2. The files are converted, dataset.json last (an interrupted run leaves a readable format-3 package that converts again next time).
3. Every converted file is re-read and each row compared with the original.
4. Only then is the backup deleted. If anything differs, the originals are written back and the backup is kept; a toast says where.

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
