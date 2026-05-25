# Data Flow

## Purpose
- Route agents across ingest → identify → persist → export without duplicating module internals.

## Scope
- Owns: `src/features/data-flow/{1.ingest,2.identify,3.persist,4.export}/`, filesystem pick/restore, indexed file state.
- Does not own: mothbox-next package contract (`../mothbox-next/`), route UI composition (`src/routes/`).

## Read Rules
- Prefer numbered stage folders in order for end-to-end flows.
- Package open path bypasses legacy `ingestFilesToStores` — follow `detectIngestMode` and `singlePassIngest`.
- Update this file when stage boundaries, entry files, or proof paths change.
- Discoverable from root `CONTEXT-MAP.md`.

## Routes
- **1. Ingest** — `1.ingest/`
  - Folder pick / restore pipeline: `ingest-folder-pipeline.ts` (canonical open/restore path)
  - Ingest mode: `ingest-mode.ts` (`legacy` | `mothbox-next`)
  - Archive filter: `reserved-paths.ts` (`00_source/` excluded once)
  - Folder pick / restore entry: `files.service.ts`, `files.fs.ts` (`normalizeIndexedFilesForIngest`)
  - Legacy path parsing: `ingest-paths.ts` (`parsePathParts`, `resolveNightEntityIdFromRoute`)
  - Legacy store ingest: `ingest.ts`
  - Package single-pass: `files.single-pass.ts` → `1.ingest/package/ingest-package.ts`
  - Datasets workspace: `choose-datasets-folder.ts`, `build-mothbox-package-from-folder.ts`, `content-integration-checks.ts`
  - Indexed state / preload: `files.initialize.ts`
- **2. Identify** — `2.identify/` (dialog, species lists, picker state)
- **3. Persist** — `3.persist/` (`_identified.json`, summaries, covers, links; package persist via mothbox-next)
- **4. Export** — `4.export/` (Darwin CSV)
- Flow diagrams (verify vs code): `docs/data-ingestion-identification-export-flows.md`, `docs/data-flow-complete-diagram.md`

## Contracts And Memory
- Invariants: none yet
- ADRs: none yet
- Target memory: none yet

## Proof Paths
- Ingest: `1.ingest/__tests__/` (`ingest-paths`, `files.root-discovery`, `files.service.integration`)
- Integration: `src/__tests__/data-flow-integration.test.ts`
- Export: `4.export/__tests__/`
- Commands: `bun run test`, `bun run check`

## Language
**Legacy ingest**:
Folder tree `project/deployment/night/(patches/)` parsed into entity stores.
_Avoid_: running legacy root discovery on mothbox-next packages — use `normalizeIndexedFilesForIngest`.

**Datasets folder**:
Parent directory holding one subfolder per package; chosen before in-app migrate.
_Avoid_: confusing with a single legacy project root.

## Relationships
- **1.ingest** feeds **2.identify** / night UI via `detectionsStore` and `patchesStore`.
- Package ingest delegates record loading to `../mothbox-next/reload-package.ts`.
