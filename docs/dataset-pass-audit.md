# Dataset Pass Audit

Date: 2026-05-31  
Root checked: `/Users/bernat/Desktop/datasets to pass`

## Summary

The concrete legacy Mothbox datasets in the root have been converted or refreshed as Mothbox Next packages and validated with `.agents/skills/dataset-adapter/scripts/validate_adapter_output.py`.

Do not use `/Users/bernat/Desktop/datasets to pass` itself as the app dataset root yet. It is a bundle containing container folders and archives, and current discovery only works reliably when pointed at a specific dataset package or a direct parent of package folders.

## Passing Package Roots

| Path under root | Source kind | Patches | Deployments | Camera days | Classification rows | Status |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `Datasets/Cerro_Hoya_Expeditiom_reduced` | existing package refreshed | 1,999 | 1 | 1 | 3,998 | pass |
| `Datasets/Cerro_Hoya_Expedition` | existing package refreshed | 5,598 | 3 | 6 | 11,069 | pass |
| `Datasets/Dinacon2025-no-raw-img` | existing package refreshed | 74 | 3 | 4 | 76 | pass |
| `Datasets/Test` | patch images only | 2 | 0 | 1 | 0 | pass |
| `Datasets Raw/2025-06-22` | in-place legacy Mothbox | 8 | 1 | 1 | 8 | pass |
| `Datasets Raw/Cerry_Hoya_Expedition_reduced` | in-place legacy Mothbox | 24 | 1 | 3 | 24 | pass |
| `Datasets Raw/Hoya` | in-place legacy Mothbox | 7,236 | 1 | 3 | 7,332 | pass |
| `Datasets Raw/Mothbox Datasets Old/Dinacon2025` | in-place legacy Mothbox | 74 | 3 | 4 | 76 | pass |
| `Datasets Raw/Mothbox Datasets Old/Dinacon2025-no-raw-img` | in-place legacy Mothbox | 74 | 3 | 4 | 76 | pass |
| `Datasets Raw/stress Dataset` | in-place legacy Mothbox | 19,170 | 2 | 3 | 19,329 | pass |
| `Mothbox sample data - April 2026/Mini sample Mothbox dataset (processed)/Cerro_Hoya_Expedition` | in-place legacy Mothbox | 5,598 | 3 | 6 | 11,069 | pass |
| `Mothbox sample data - April 2026/Mini sample Mothbox dataset (processed)/Oria` | in-place legacy Mothbox | 221 | 1 | 1 | 221 | pass |

## Not Run / Doubts

| Path under root | Reason |
| --- | --- |
| `Datasets/Species` | Support data only. Contains species CSV files, not a dataset root. |
| `Datasets Raw/Mothbox Datasets Old` | Container folder. Nested `Dinacon2025` and `Dinacon2025-no-raw-img` were processed instead. |
| `Datasets Raw/Mothbox Datasets Old/Species` | Support data only. |
| `Mothbox sample data - April 2026` | Bundle folder. Nested processed dataset roots were handled individually. |
| `Mothbox sample data - April 2026/Mini sample Mothbox dataset (processed)` | Container folder plus metadata/support files. Nested `Cerro_Hoya_Expedition` and `Oria` were processed instead. |
| `Mothbox sample data - April 2026/Mini sample Mothbox dataset (processed)/Species` | Support data only. |
| `Mothbox sample data - April 2026/Mini sample Mothbox dataset (unprocessed)` | Source-photo-only bundle. Running the current patch-images-only adapter here would treat full source photos as patches, which is probably wrong for the intended deployment/night image browsing model. |
| `Mothbox sample data - April 2026/Mini sample Mothbox dataset (unprocessed)/Cerro_Hoya_Expedition` | Source photos only, no bot metadata or patch assets. Needs an explicit image-only adapter decision. |
| `Mothbox sample data - April 2026/Mini sample Mothbox dataset (unprocessed)/Oria` | Source photos only, no bot metadata or patch assets. Needs an explicit image-only adapter decision. |
| `Mothbox sample data - April 2026/Mini sample Mothbox dataset (unprocessed)/Species` | Support data only. |
| `ami-sample-20260526T135813Z-3-001.zip` | AMI archive. Contains raw snapshots, `_crops_`, parquet metadata, and a tiny legacy-style sample. AMI parquet/csv ingestion is documented in the skill but not implemented in the app adapter yet, so I did not run it. |
| `ami-sample.zip` | Larger AMI archive. Same doubt as above, with many more files; not extracted. |
| `Mothbox sample data - April 2026-20260525T192250Z-3-001.zip` | Archive copy of the Mothbox sample bundle. Extracted contents already exist and were handled at the concrete dataset roots where appropriate. |
| Proposed `_processed` mirror structure | No extracted concrete `_processed` mirror sample was present in this target root. Needs a fixture or sample before implementing that adapter branch. |

## Adapter Fixes Made

- `adapters/dinalab-mothbox-v1/adapter.ts` now supports direct CLI conversion of `00_source`, in-place legacy roots, and patch-images-only roots, with `--force` for refreshing an existing package.
- `src/features/mothbox-next/adapters/dinalab-mothbox-v1/node-adapter-io.ts` now correctly calls `entry.isDirectory()`, which prevents file entries like `.DS_Store` from being traversed as directories.
- `src/features/mothbox-next/adapters/dinalab-mothbox-v1/build-dinalab-adapter-records.ts` now maps `_identified.json` rows through the emitted patch records for that bot file. This fixes duplicate crop filename disambiguation and skips human rows that reference missing patch images.
- `tsconfig.json` now defines root `~/*` and `@/*` path aliases so the adapter CLI can run from `bun run` without Vite.

## Verification

- `bun run check`
- `bun run test src/features/mothbox-next/adapters/dinalab-mothbox-v1/__tests__/build-dinalab-adapter-records.test.ts src/features/mothbox-next/adapters/dinalab-mothbox-v1/__tests__/adapter-patch-assets.test.ts src/features/mothbox-next/__tests__/validate-dataset-package.test.ts`
- `bun run verify:mothbox-next` passed phases 1, 3, 4, 5, 6, and 7. Phase 2 was skipped because `source-dinacon-mini` is not present in this checkout.
- `python3 .agents/skills/dataset-adapter/scripts/validate_adapter_output.py <package-root>` for every passing package root listed above

## Remaining Work

- Implement AMI parquet/csv ingestion as its own adapter branch. Use `detectionid` as the stable patch id, match crops with `{filename-without-.jpg}_crop_{detectionid}.jpg`, and preserve `sourceimageid`, `deploymentid`, URL, WKT/coordinates, and metadata path in patch-source trace fields.
- Implement the new Mothbox `_processed` mirror adapter once a concrete sample exists in the workspace.
- Decide what image-only source folders should mean in Mothbox Next: source-photo browsing, patch records with no classifications, or a separate photo-level record type.
- Improve dataset discovery if the app is expected to accept container roots like `/Users/bernat/Desktop/datasets to pass` and recurse to nested package roots.
