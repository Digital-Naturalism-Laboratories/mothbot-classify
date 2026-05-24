# Mothbox Next Package

## Purpose
- Route agents through the NDJSON dataset package contract, loaders, adapters, and entity bridge into app stores.

## Scope
- Owns: `dataset.json`, `00_source/`–`03_classifications/`, package validation, resolver, hydration, persist, in-app migrate.
- Does not own: legacy Dinalab folder ingest (`src/features/data-flow/1.ingest/`), night grid UI, species picker.

## Read Rules
- Start with `docs/mothbox-next-package.md` for layout; use code here for load/save truth.
- `03_classifications/` is authoritative on load; `02_records/current-classifications.ndjson` is a rewritten cache.
- `00_source/` is archive-only — never treat it as a second app project (see ingest-paths + `isPackageArchiveRelativePath`).
- Update this file when package boundaries, routes, proof paths, or bridge fields change.
- Discoverable from root `CONTEXT-MAP.md`.

## Routes
- Manifest & types: `dataset-manifest.ts`, `records.ts`
- Open / validate indexed folder: `load-package-data.ts`, `validate-dataset-package.ts`, `package-indexed-access.ts`
- Entity bridge: `hydration-bridge.ts`, `classification-to-detection.ts`, `reload-package.ts`
- Resolver rules: `resolve-classifications.ts`, `resolver-spec.md`
- Persist human edits: `persist/persist-human-classifications.ts`
- Import collaborator file: `import-classifications.ts`
- In-app ingest entry: `../data-flow/1.ingest/package/ingest-package.ts`
- In-app migrate: `../data-flow/1.ingest/convert-legacy-to-package.ts`
- Dinalab adapter (core): `adapters/dinalab-mothbox-v1/run-adapter.ts`
- Dinalab adapter (browser IO): `adapters/dinalab-mothbox-v1/browser-adapter-io.ts`
- CLI wrapper: `../../../adapters/dinalab-mothbox-v1/adapter.ts`
- Hierarchy from deployment folder names: `adapters/dinalab-mothbox-v1/derive-dinalab-hierarchy.ts`
- Active package atom: `active-package.ts`
- Export / health: `package-export.ts`, `package-health.ts`

## Contracts And Memory
- Invariants: none yet
- ADRs: none yet
- Target memory: none yet

## Proof Paths
- Tests: `__tests__/` (`ingest-package`, `persist-round-trip`, `resolve-classifications`, `derive-dinalab-hierarchy`, `package-indexed-paths`)
- Fixture package: `__tests__/fixtures/packages/04_dinacon_lightweight_substrate/`
- Command: `bun run verify:mothbox-next`

## Language
**Mothbox Next package**:
Finished folder with `dataset.json` (`format: mothbox-next-dataset`) that the app opens directly.
_Avoid_: opening raw legacy `deployment/night/patches` trees without converting.

**Camera day id**:
Canonical `nightId` in stores for package nights (`{deploymentId}__{night_date}`).
_Avoid_: rebuilding `project/deployment/night` paths for package routes — use `resolveNightEntityIdFromRoute` in `../data-flow/1.ingest/ingest-paths.ts`.

**Package archive (`00_source/`)**:
Full legacy tree copy for provenance; excluded from legacy path indexing.
_Avoid_: ingesting archive paths as a top-level project named `00_source`.

## Relationships
- **Adapter** writes package files; **hydration-bridge** maps them into `projectsStore` / `detectionsStore`.
- **Dataset id** in manifest becomes app **project** id for the package session.
- Legacy ingest remains behind `src/config/ingest.ts` until disabled.

## Flagged Ambiguities
- "Night" in UI vs **camera day id** in records — same entity, different string shapes in URLs vs store keys.
