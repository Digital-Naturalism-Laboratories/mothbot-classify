# Mothbot Classify Context Map

## Purpose
- Route agents to the correct local `CONTEXT.md` or canonical doc.
- Keep repo-wide language in root `CONTEXT.md`; keep package and pipeline routing in feature contexts.

## Contexts
| Context | Path | When to read |
|---------|------|----------------|
| App language & domain terms | `CONTEXT.md` | Naming, hierarchy concepts, ambiguities (project vs dataset, patch vs detection) |
| Data flow pipeline | `src/features/data-flow/CONTEXT.md` | Folder pick, ingest, identify, persist, export, legacy path rules |
| Open/restore pipeline | `src/features/data-flow/1.ingest/ingest-folder-pipeline.ts` | Single path after folder pick: normalize → validate → index → ingest |
| Mothbox Next package | `src/features/mothbox-next/CONTEXT.md` | `dataset.json`, NDJSON records, adapters, migrate, reload, collaboration import |
| Package format reference | `docs/mothbox-next-package.md` | Folder layout and operator steps; verify against code on behavior |
| Night labeling UI | `src/routes/5.night/` | Grid, selection bar, identify dialog wiring (no local CONTEXT yet) |
| Workspace agent rules | `.cursor/rules/` | React, testing, Tailwind conventions — not domain truth |
| Legacy domain rule | `.cursor/rules/project-context.mdc` | Older entity sketch — verify against stores before relying |

## Repo Entry Surfaces
- Operator setup: `README.md`
- Home / folder picking UX: `src/components/nav.tsx` (`FolderPicking`)
- Entity stores: `src/stores/entities/`
- Ingest mode flag: `src/config/ingest.ts` (`legacyIngestEnabled`)

## Contracts And Memory
- Invariants: none yet
- ADRs: none yet (`docs/adr/` not present)
- Target memory: none yet

## Proof Paths
- Unit/integration: `bun run test`
- Types: `bun run check`
- Package harness: `bun run verify:mothbox-next` → `verify-report.json`

## Flagged Ambiguities
- Root `CONTEXT.md` uses **dataset**; UI/routes still say **project** in URLs (`/projects/...`). Use the term required by the surface you are changing.
