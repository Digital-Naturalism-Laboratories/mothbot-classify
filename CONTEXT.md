# Mothbot Classify Context

## Purpose
- Canonical **domain language** for local-first insect patch classification.
- Repo-wide routing lives in `CONTEXT-MAP.md`; subsystem routing lives in local `CONTEXT.md` files.

## Scope
- Owns: terminology, scientific hierarchy concepts, cross-cutting ambiguities.
- Does not own: ingest/package implementation, UI routes, file-format behavior (see linked contexts).

## Read Rules
- Read `CONTEXT-MAP.md` first to pick the right subsystem context.
- Prefer code and tests over prose when behavior matters.
- Use this file for terms and relationships only; do not add implementation walkthroughs here.
- Update this file when domain language or repo-wide ambiguities change; update `CONTEXT-MAP.md` when contexts or proof paths change.

## Routes
- Context map (start here for tasks): `CONTEXT-MAP.md`
- Data flow pipeline: `src/features/data-flow/CONTEXT.md`
- Mothbox Next package: `src/features/mothbox-next/CONTEXT.md`
- Package operator doc: `docs/mothbox-next-package.md`
- Entity stores: `src/stores/entities/`
- Night labeling UI: `src/routes/5.night/`
- Workspace rules: `.cursor/rules/` (including `project-context.mdc` — verify against code)

## Contracts And Memory
- Invariants: none yet
- ADRs: none yet
- Target memory: none yet

## Proof Paths
- `bun run test`
- `bun run check`
- `bun run verify:mothbox-next` (package subsystem)

## Language
**Dataset**:
A collection of patches to classify, plus any optional context layers needed for provenance, organization, collaboration, and export.
_Avoid_: using "project" when the important concept is the scientific/classification dataset.

**Dataset Package**:
A portable, inspectable folder representation of a dataset for upload, transfer, import, or collaboration. It may include source assets, canonical patch images, normalized records, classifications, and exports.
_Avoid_: calling this a database dump in user-facing language.

**Source**:
The native incoming material for a dataset before Mothbox normalizes it. In the package shape this is singular `00_source/`; for Dinalab it can contain the current deployment folders directly.
_Avoid_: forcing source material into artificial wrapper folders.

**Source Layer**:
The inspectable input layer inside a dataset package, not the normalized app contract.
_Avoid_: placing generated exports inside the source layer.

**Adapter**:
A repeatable, runnable JavaScript translator folder that reads one source shape and emits canonical dataset records, classifications, `01_patches/`, and validation reports. Custom/workgroup adapters live one level above dataset folders in a shared `adapters/` folder and can be referenced by many datasets.
_Avoid_: putting scientific merge policy or app workflow state inside an adapter.

**Patches Folder**:
The canonical app-facing patch image layer at `01_patches/`. Images here may be copied from source, cropped from raw photos, or supplied directly when the incoming dataset is already patch-only.
_Avoid_: treating `01_patches/` as the original scientific source; provenance belongs in `02_records/patch-sources.ndjson`.

**Project**:
The app/workspace container that currently maps most closely to a dataset in the filesystem and UI.
_Avoid_: assuming it always means a single site, deployment, or night.

**Deployment**:
A first-class fieldwork context for hardware-capture datasets: a device deployed at a site over a span of nights.
_Avoid_: assuming every dataset has deployments; pure image datasets may have none.

**Site**:
The real-world location where a deployment happens; current folder structures may not capture site as a distinct path segment and may encode it in names instead.

**Night**:
A Mothbox-specific grouping of photos and patches captured by one device during one night; useful for browsing and batching, but not a required dataset layer.

**Camera Day**:
One device operating for one night; ten devices in one night equals ten camera days.
_Avoid_: using it as a synonym for calendar day.

**Raw Photo**:
The original full-frame image; important for provenance and occasional reference, but not usually needed for classification handoff.

**Patch**:
The atomic classification unit: the visual item a human or model classifies, whether represented by a crop file, a raw image, a generated view, or a source reference plus geometry.
_Avoid_: treating the raw photo or per-photo JSON file as the human work unit.

**Patch Source**:
Optional source context that explains where a patch came from, such as original media, raw photo, crop coordinates, cropper, or imported filename.
_Avoid_: "provenance" in user-facing folder/file names when "source" is clear enough.

**Legacy Bot Detection**:
The current Python/Mothbot JSON shape that mixes patch creation, crop source, bot classification, and clustering fields.
_Avoid_: preserving it as a single core concept in the next data model.

**Classification**:
A human or bot claim about what a patch is, such as order-level acceptance, species identification, morphospecies assignment, or error marking.
_Avoid_: "annotation" for the primary user-facing workflow unless a broader non-classification mark is actually being modeled.

**Substrate**:
The portable base data needed to classify patches locally: patch images plus the minimum patch metadata needed to identify and load them.
_Avoid_: assuming substrate always means the user's original source folder layout.

## Relationships
- **Dataset** is the classification boundary; **patch** is the irreducible atom inside it.
- **Source** preserves incoming reality; **adapter** translates it into normalized dataset records.
- **Dataset package** is the social/transfer contract; **source layer** is the native input area inside it.
- One dataset owner may manage **source** and shared **adapter** work; other collaborators can work from the bridged **substrate**.
- Shared/workgroup **adapters** belong one level above individual dataset packages when the same source format is reused across datasets.
- **Derived media** plus `02_records/` and `03_classifications/` is the lightweight substrate that travels between Mothbox Classify users.
- Lightweight or cloud uploads should prefer derived substrate over raw photos; raw photos can be too large to transfer routinely.
- **Deployment**, **site**, **night**, and **camera day** are optional for generic patch datasets and central for hardware-capture datasets.
- **Patch** is the human work unit; **raw photo** and **legacy bot detection JSON** are optional patch sources.
- **Classification** belongs to a **patch** and may be exchanged between collaborators independently of raw photos.
- **Deployment** happens at a **site** and contributes one or more **nights** only for Mothbox-style acquisition datasets.
- `03_classifications/{classifier}.ndjson` records per-classifier claims; `02_records/current-classifications.ndjson` records the current resolved classification per patch.
- Adapter output must be deterministic enough that rerunning it on unchanged sources does not create new patch identities.
- `02_records/patch-sources.ndjson` should retain traces back to original source paths/IDs even when those files are absent on a collaborator's computer.

## Flagged Ambiguities
- "Project" and "dataset" are currently close together. Use **dataset** for scientific/classification scope and **project** for app/filesystem container unless code requires the existing term.
- "Accept" has been used to mean generic approval and order-level human review. Verify the current code path before naming new data fields around it.
- "Site" may be a domain concept even when not represented as a folder. Do not assume folder depth fully captures the scientific hierarchy.
- "Deployment" and "night" are useful for Mothbox monitoring datasets but must not be treated as mandatory for all patch classification datasets.
- "Detection" is overloaded. Use **legacy bot detection** for existing `_botdetection.json` files, **patch source** for crop/source lineage, and **classification** for taxonomic claims.
- "Patch folder" and **patch** are different concepts. A patch can be a canonical record even when its image is stored in a source package or generated derived-media folder.
- "Source" and **substrate** are related but not identical. Source is the native input layer; substrate is the standardized transferable base needed for classification.
