---
name: dataset-adapter
description: Use when adding or fixing Mothbox Classify dataset adapters, investigating unfamiliar dataset folder layouts, converting AMI/Mothbox legacy/_processed/images-only datasets into Mothbox Next packages, or validating adapter output.
---

# Dataset Adapter

## Goal

Turn one real source dataset shape into a Mothbox Next package without broad guessing. Start with one sample, preserve source paths in records, validate the package, then generalize only when another concrete sample requires it.

## Standard Workflow

1. Read repo context first: `CONTEXT.md`, `CONTEXT-MAP.md`, `src/features/mothbox-next/CONTEXT.md`, and `docs/mothbox-next-package.md`.
2. Fingerprint the sample shape with bounded commands:
   - `find <sample> -maxdepth 5 -type d`
   - `find <sample> -type f | awk ...` to count images, JSON, CSV, parquet, and manifests.
   - Inspect 1-2 representative metadata files, not the whole dataset.
3. Classify the input as one narrow source kind:
   - finished Mothbox Next package: has `dataset.json`.
   - legacy Mothbot: has `*_botdetection.json` and adjacent `patches/`.
   - new Mothbox `_processed`: root source tree plus `_processed/` mirror containing patches and JSON.
   - AMI: raw snapshots under `project/year/country/device/`, crops under `project/year/_crops_/country/device/`, dataset-level parquet or CSV metadata.
   - patch images only: image files without machine metadata.
4. Define the mapping before coding:
   - source path pattern -> patch asset path.
   - stable `patch_id`.
   - deployment/site/device/night grouping fields.
   - bot classifier rows and taxonomy mapping.
   - source trace fields for `patch-sources.ndjson`.
5. Add or extend the adapter in `src/features/mothbox-next/adapters/`, keeping source parsing separate from package writing.
6. Add fixture coverage for the exact sample shape first. Prefer tiny fixtures with 1-3 source images and patches.
7. Validate with `python3 .agents/skills/dataset-adapter/scripts/validate_adapter_output.py <package-root>`, then run `bun run verify:mothbox-next`.
8. Generate inspectable audit output for every converted or reviewed package:
   - Use `.agents/skills/dataset-adapter/scripts/generate_audit_reports.mjs`.
   - Write outputs under `.dataset-adapter-audit/<run-name>/` so generated reports and screenshots stay git ignored.
   - Include `report.md`, `report.json`, `report.html`, `screenshot.png`, and an aggregate `review.md`/`contact-sheet.png`.
   - Inspect `review.md` and the screenshots before claiming the dataset passes.
9. Only then wire dataset discovery/setup UI if the folder kind needs to open directly from the app.

## Adapter Contract

Every adapter must emit the package contract documented in `docs/mothbox-next-package.md`:

- `dataset.json`
- `02_records/patches.ndjson`
- `02_records/patch-sources.ndjson`
- `02_records/deployments.ndjson`
- `02_records/camera-days.ndjson`
- `03_classifications/_bot.ndjson` when machine IDs exist
- `02_records/current-classifications.ndjson` as a cache resolved from classification files

Patch identity must be deterministic across reruns. Prefer upstream IDs such as AMI `detectionid`; otherwise derive from normalized crop filename plus disambiguating leaf id.

## Audit Report Output

After conversion, produce a high-level log for each package that shows:

- package counts: patches, patch sources, deployments, camera days/nights, classifier files, classification rows, current classifications.
- folder/path structure with per-folder patch counts.
- deployment and camera-day tables with patch counts and top terms.
- top labels/taxonomic terms and classifier/source-type counts.
- structural flags such as missing assets, stale classifier files, missing deployment/camera-day records, unknown classification patch ids, or placeholder-looking deployment ids.

Standard command:

```bash
node .agents/skills/dataset-adapter/scripts/generate_audit_reports.mjs \
  --root "<datasets-root>" \
  --out ".dataset-adapter-audit/<run-name>"
```

Review the generated `review.md` and `contact-sheet.png` manually. If something looks questionable but not clearly wrong, record it in the audit instead of silently accepting it.

## AMI Notes

Read `references/known-dataset-shapes.md` before implementing AMI or `_processed` support.

For AMI parquet/CSV rows, group by `detectionid`. The same detection can appear once per `taxonlevel`; use the grouped rows to build one patch plus one classification claim. Match crop files by the AMI crop naming pattern:

```text
{filename-without-.jpg}_crop_{detectionid}.jpg
```

Preserve the raw `sourceimageid`, `deploymentid`, `url`, `wktposition`, coordinates, and metadata path in `patch-sources.ndjson` extras or trace fields if the app schema is extended. Do not drop them just because the first UI surface does not show them.

## Bug Fix Rule

When a dataset fails to open, decide whether the bug is:

- discovery/setup: `src/features/data-flow/1.ingest/classify-dataset-folder.ts` or setup-kind resolution.
- adapter parsing: source files are recognized but mapped incorrectly.
- package loading: valid package records fail to hydrate.
- UI hierarchy: records hydrate but tree/night routes are wrong.

Fix the lowest layer that is actually wrong and add a regression test at that layer.
