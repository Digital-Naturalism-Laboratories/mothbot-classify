# New Entity Config (Generator)

## Purpose

- Generate a new entity for a tenant by scaffolding files from the template and wiring it into the tenant app config, nav, and blocks.

## Inputs (ask me for these when running)

- tenantSlug (e.g. "ponterra-mexico")
- entitySingular (e.g. "Seed Tree")
- entityPlural (e.g. "Seed Trees")
- entityKey (camelCase plural, e.g. "seedTrees")
- slug (kebab-case plural, e.g. "seed-trees")
- icon (lucide icon key, e.g. "trees")
- importType (optional: "none" | "photos" | "spreadsheet" | "geofile")
- importKeys (optional: array of column names if spreadsheet)
- urlIdField (optional, e.g. "externalId" for dual-id tenants)
- **Note:** `entityTypeId` will be automatically generated if needed (see step 2)

## Template source

- Use files under `~/app/(tenants)/_template_simple/entities.entity`:
  - `entity.ts`
  - `meta.ts`
  - `blocks.ts`

Related types (clickable in Cursor):

- [AppConfig](mdc:src/types/app-config.types.ts)
- [EntityConfig](mdc:src/types/entity-config.types.ts)
- [MetaFieldConfig](mdc:src/types/meta-config.types.ts)
- [BlocksRenderer](mdc:src/components/blocks/block-renderer.tsx)
- [MapBlocks](mdc:src/components/blocks/map-blocks/map-block.ts)

## Placement strategy

- Detect the tenant app at `src/app/(tenants)/{tenantSlug}`.
- If the tenant has an `entities/` folder, create `entities/{entityKey}/` and place the files there.
- If not, keep the tenant’s existing pattern: create `entities/{entityKey}/` sibling to `app-config.ts`, and import into `app-config.ts` (do not force a structural change).

## Steps to perform

1. Create files from template

- Copy `entity.ts`, `meta.ts`, `blocks.ts` from `/_template_simple/entities.entity/` into `/{tenantSlug}/entities/{entityKey}/`.

2. Determine if `entityTypeId` is required and generate it

- **Check if `entityTypeId` is required:**
  - Required when `importType` is `"photos"` or `"geofile"`, OR
  - Required when `metaDefinitions` contains fields of type `"attachment"`, `"image"`, or `"geofile"`.
- **If required, generate it automatically:**
  - Run `bun run generate-entity-type-id` (or import and call `generateEntityTypeId()` from `scripts/generate-entity-type-id.ts`)
  - This will generate a unique 8-character ID (e.g., "s9eqlqt8")
  - Use this generated ID in step 3

3. Replace placeholders in `entity.ts`

- Set: `singular`, `plural`, `key`, `slug`, `icon`.
- If needed: set `urlIdField`.
- **Set `entityTypeId` if required (from step 2):**
  - Use the generated `entityTypeId` from step 2
- Add blocks wiring:

```ts
import type { EntityConfig } from '~/types'
import { metaConfig } from './meta'
import { multipleBlocks, singleBlocks, mapBlocks } from './blocks'

export const entityConfig = {
  singular: 'Entity',
  plural: 'Entities',
  key: 'entities',
  slug: 'entities',
  icon: 'trees',
  entityTypeId: 's9eqlqt8', // Auto-generated if entity has attachments, geofiles, or photos

  insertable: false,
  deletable: false,
  editable: false,

  dataLoading: { autoFetch: true, useCache: true, dataSources: [] },

  mapConfig: { entityLayer: 'properties' },

  multiple: { blocks: multipleBlocks },
  single: { blocks: singleBlocks, mapBlocks },

  metaDefinitions: metaConfig,
} satisfies EntityConfig
```

4. Update `meta.ts`

- Keep basic fields, and if importing from spreadsheets, add `importKeys` (array of header strings).
- Ensure field `name` has `isName: true` when you want it to appear in titles.
- For select options with colors, use string values (e.g., `color: 'red'`) rather than other formats.
- **Note:** If `meta.ts` contains fields of type `"attachment"`, `"image"`, or `"geofile"`, `entityTypeId` will be automatically generated and set in `entity.ts` (see step 2).

5. Wire into the tenant `app-config.ts`

- Import the new entity config and add it to `entitiesConfig`:

```ts
import type { AppConfig } from '~/types'
import { entityConfig as seedTrees } from './entities/seed-trees/entity'

export const appConfig = {
  // ...
  nav: { list: ['seed-trees'] },
  entitiesConfig: {
    seedTrees,
  },
} satisfies AppConfig
```

- If `nav.list` exists, ensure it includes the new `slug`.

6. Map blocks (optional)

- In `blocks.ts` use the exported arrays:

```ts
import type { Block } from '~/components/blocks/block-renderer'
import type { MapBlock } from '~/components/blocks/map-blocks/map-block'

export const multipleBlocks = [] satisfies Block[]
export const singleBlocks = [] satisfies Block[]
export const mapBlocks = [] satisfies MapBlock[]
```

- For a simple map setup you can add an `'entity-layer'` map block later; see [MapBlocks](mdc:src/components/blocks/map-blocks/map-block.ts).

## Validation checklist

- Types compile: newly added imports resolve
- Entity appears in the left nav via `slug`
- Visiting `/{tenantSlug}/{slug}` renders without runtime errors
- No undefined access; prefer optional chaining from the root (e.g. `obj?.child?.leaf`)
- Lints pass on edited files
- **If entity has uploads (attachments, geofiles, or photos):** `entityTypeId` is automatically generated and set

## Conventions to follow

- Naming: never abbreviate; use `entityKey` camelCase plural and `slug` kebab-case plural.
- No default exports. Keep higher-level objects/functions at the top of the file.
- Use early returns and optional chaining. Avoid non-null assertions.
- Avoid derived state; compute values in render when possible.
- Colors: When defining colors for select options or other field configurations, always use string values (e.g., `color: 'blue'`, `color: '#ff0000'`).

## Notes

- If a tenant keeps all entities inline inside `app-config.ts`, prefer importing the file you just created and adding it to `entitiesConfig` (do not duplicate config inline).
- For importing flows, use `importKeys` in `meta.ts` and set `entityConfig.import` accordingly (`photos` | `spreadsheet` | `geofile`).
- **`entityTypeId` requirement:** Entities that handle file uploads (attachments, geofiles, or photos) require an `entityTypeId` to organize files in S3 storage. This ID must be unique per entity type and is used to construct storage paths. The command will automatically:
  1. Check if `importType` is `"photos"` or `"geofile"`, OR if `metaDefinitions` contains fields of type `"attachment"`, `"image"`, or `"geofile"`
  2. Generate a unique 8-character ID using `bun run generate-entity-type-id` (or import `generateEntityTypeId()` from `scripts/generate-entity-type-id.ts`) if required
  3. Set the generated ID in `entity.ts`
- Reference: see `.cursor/rules/entity-config.mdc` and `.cursor/rules/blocks.mdc` for deeper context.
