# Entity Blocks Command

## Purpose

- Interpret natural language descriptions of data display needs at any level of detail (high-level interpretation to low-level validation/improvement)
- Add individual blocks to existing `blocks.ts` files OR scaffold complete `blocks.ts` files from scratch
- Support both single-block requests and multi-block descriptions (with clarifying questions as needed)
- Guide the model to generate appropriate block configurations referencing block-renderer.tsx and map-blocks-renderer.tsx

## Inputs (ask for clarification when needed)

**Required:**

- tenantSlug (e.g. "ponterra-mexico")
- entityKey (e.g. "properties")
- blockContext (which array to modify: "multiple" | "single" | "map")
- blockDescription (natural language description at any level of detail)

**Optional:**

- existingBlocksFile (path to existing blocks.ts if modifying, otherwise will locate)
- operationMode ("add" | "scaffold" | "modify" | "validate" - infer from context)
- specificBlockType (if user wants a specific block type, otherwise infer from description)
- accessorPaths (if not clear from context, ask for field names)
- conditionalDisplay (when to show/hide blocks)

## Template source

- Reference files:
  - [Block types and props](mdc:src/components/blocks/block-renderer.tsx) - All available block types
  - [Map block types](mdc:src/components/blocks/map-blocks/map-block.ts) - Map-specific blocks
  - [Blocks rule](mdc:.cursor/rules/blocks.mdc) - Block component references

- Example files to reference:
  - `src/app/(tenants)/ponterra-mexico/entities/properties/blocks.ts` - Complex blocks example
  - `src/app/(tenants)/jaguar-rescue-center/entities/animals/blocks.ts` - Simple blocks example
  - `src/app/(tenants)/(ponterra)/azuero/_entities/properties/blocks.map.ts` - Map blocks example
  - `src/app/(tenants)/_template_simple/entities.entity/blocks.ts` - Template empty file

Related types (clickable in Cursor):

- [Block](mdc:src/components/blocks/block-renderer.tsx)
- [MapBlock](mdc:src/components/blocks/map-blocks/map-block.ts)
- [BlockType](mdc:src/components/blocks/block-renderer.tsx)
- [DataContextV2](mdc:src/app-system/stores/data-context.ts)

## Natural Language Interpretation Guide

### Level Detection

**High-Level** (interpret extensively):

- "show stats for planted trees and area"
- "display images and related properties"
- "create a dashboard with overview and details tabs"
- Strategy: Parse intent, infer block types, ask for missing details

**Mid-Level** (interpret with validation):

- "add a stats block with planted trees and reforested area"
- "show image gallery from photos field"
- Strategy: Map to block types, validate accessor keys exist, confirm details

**Low-Level** (validate and improve):

- "add { type: 'stats', stats: { items: [...] } }"
- "the accessorKey should be currentEntity.meta.fieldName"
- Strategy: Validate structure, suggest improvements, ensure type safety

### Common Patterns to Recognize

1. **Stats/Counts**: "show stats", "display count", "show number of X", "metrics"
   - Maps to: `type: 'stats'`
   - Extract: metric names, icons, accessor keys
   - Ask if unclear: "Which fields should be displayed? What icons?"

2. **Images**: "show images", "display photos", "image gallery", "photo grid"
   - Maps to: `type: 'image-gallery'` or `type: 'image'` (single)
   - Extract: accessor key to image field
   - Ask if unclear: "Which field contains the images?"

3. **Attributes/Fields**: "show fields", "display attributes", "list properties", "show all fields"
   - Maps to: `type: 'attributes-list'`
   - Extract: field names from meta definitions
   - Ask if unclear: "Which specific fields? Or show all?"

4. **Tables**: "show table", "display data table", "list entities", "tabular data"
   - Maps to: `type: 'data-table'` or `type: 'entities-table'`
   - Extract: columns, entity relationships
   - Ask if unclear: "What columns? Which entity type?"

5. **Related Entities**: "show related X", "display linked Y", "related entities"
   - Maps to: `type: 'relation-list'` or `type: 'entities-layout'`
   - Extract: entity key, relationship filters
   - Ask if unclear: "Which entity type? How should they be filtered?"

6. **Maps**: "show on map", "map layer", "display raster", "geo photos"
   - Maps to: `type: 'entity-layer'`, `type: 'map-raster'`, `type: 'map-geo-photos'`
   - Extract: entity key, filters, URL/path
   - Ask if unclear: "Entity layer or raster? What filters?"

7. **Tabs/Sections**: "in tabs", "separate sections", "group by category", "dashboard tabs"
   - Maps to: `type: 'tabs'` with nested blocks
   - Extract: tab labels, icons, block groupings
   - Ask if unclear: "How many tabs? What should each contain?"

8. **Charts/Visualizations**: "show chart", "timeline", "category bar", "progress bar"
   - Maps to: `type: 'timeline-chart'`, `type: 'category-bar'`, `type: 'timeline'`
   - Extract: data source, labels, time field
   - Ask if unclear: "What data? What's the time field?"

### Accessor Key Patterns

- `currentEntity.meta.{fieldName}` - Current entity's meta field
- `currentEntity.{fieldName}` - Current entity's direct field
- `allEntities.{entityKey}` - All entities of a type
- Context accessor keys for filters: `contextAccessorKey: 'currentEntity.id'`
- Formula patterns: `'{{currentEntity.meta.fieldName}}'` for string interpolation

## Placement Strategy

1. **Locate or Create Blocks File**
   - Check `src/app/(tenants)/{tenantSlug}/entities/{entityKey}/blocks.ts`
   - Or `src/app/(tenants)/{tenantSlug}/_entities/{entityKey}/blocks.ts`
   - For map blocks, check for `blocks.map.ts` variant
   - If file doesn't exist, create from template (see below)

2. **Determine Operation Mode**
   - **Add**: Append to existing array
   - **Scaffold**: Create new file with initial blocks
   - **Modify**: Update existing block(s)
   - **Replace**: Replace entire array or specific block

3. **Determine Target Array**
   - `multipleBlocks` - For list/multiple entity view
   - `singleBlocks` - For single entity detail view
   - `mapBlocks` - For map overlays/layers

4. **If Scaffolding New File**

   ```ts
   import type { Block } from '~/components/blocks/block-renderer'
   import type { MapBlock } from '~/components/blocks/map-blocks/map-block'

   export const multipleBlocks = [] satisfies Block[]
   export const singleBlocks = [] satisfies Block[]
   export const mapBlocks = [] satisfies MapBlock[]
   ```

## Steps to Perform

1. **Determine Operation Mode**
   - Check if blocks.ts exists
   - Infer from user request: "add block" vs "create blocks" vs "show me blocks"
   - Ask if ambiguous: "Do you want to add to existing blocks or create a new file?"

2. **Parse Natural Language Description**
   - Detect description level (high/mid/low)
   - Identify block type(s) from description
   - Extract field names, entity keys, labels
   - For high-level: infer structure, ask clarifying questions
   - For low-level: validate structure, suggest improvements
   - Determine if conditional display is needed

3. **Multi-Block Handling**
   - If description contains multiple blocks (e.g., "show stats, then image gallery, then table"):
     - Parse each block description
     - Ask clarifying questions for each if needed
     - Generate all blocks in sequence
   - If user says "add multiple blocks" or similar:
     - Ask step-by-step: "What's the first block? Second block?"

4. **Clarifying Questions** (when needed)
   - Field names: "Which field contains X?" (check meta.ts for suggestions)
   - Accessor keys: "Should I use 'currentEntity.meta.fieldName'?"
   - Block type: "Do you want a stats block or data table?"
   - Display context: "Single view, multiple view, or both?"
   - Conditionals: "Should this only show when X exists?"
   - Related entities: "Which entity type? How filtered?"

5. **Verify Context**
   - Read meta.ts to verify field names exist
   - Check entitiesConfig to verify entity keys exist
   - Validate accessor key paths make sense
   - Suggest corrections if invalid

6. **Generate Block Configuration**
   - Create properly typed block object(s)
   - Use `satisfies Block` or `satisfies MapBlock` for type safety
   - Include conditional rendering if specified
   - Add proper imports if needed
   - For low-level: validate and improve structure

7. **Update Blocks Array**
   - Add/modify block(s) to appropriate array
   - Maintain proper TypeScript typing
   - Preserve existing blocks unless explicitly replacing
   - Order blocks logically (stats first, then data, then related)

## Clarifying Questions Framework

When description is ambiguous or high-level, ask:

1. **Block Type Clarification**
   - "Do you want a stats block (numbers with icons) or a data table (tabular data)?"
   - "Should images be in a gallery (grid) or single image display?"

2. **Data Source Clarification**
   - "Which field contains the images? I see these fields in meta.ts: [list fields]"
   - "What accessor key should be used? (e.g., 'currentEntity.meta.fieldName')"

3. **Display Context Clarification**
   - "Should this appear in the single entity view, multiple/list view, or both?"
   - "Should this block be conditional? (e.g., only show if field X exists)"

4. **Related Entities Clarification**
   - "Which entity type should be shown? (entityKey)"
   - "How should entities be filtered? (e.g., by currentEntity.id)"

5. **Map Blocks Clarification**
   - "Should this be an entity layer (show entities on map) or raster overlay?"
   - "What filters should apply to show only related entities?"

6. **Multi-Block Clarification**
   - "I see you mentioned multiple blocks. Should I create them all now, or go step-by-step?"
   - "For the [block type], what specific configuration do you want?"

## Common Block Patterns

### Stats Block

```ts
{
  type: 'stats',
  stats: {
    type: 'stacked', // or 'one-piece'
    items: [
      {
        label: 'Label',
        accessorKey: 'currentEntity.meta.fieldName',
        icon: 'tree',
        numericalModifiers: { decimals: 0, type: 'number' },
      },
    ],
  },
} satisfies Block
```

### Attributes List

```ts
{
  type: 'attributes-list',
  attributesList: {
    metaFieldKeys: ['field1', 'field2', 'field3'],
    hideIfEmpty: true,
  },
} satisfies Block
```

### Image Gallery

```ts
{
  type: 'image-gallery',
  imageGallery: {
    title: 'Photos',
    images: (context) => context.currentEntity?.meta?.photos || [],
  },
} satisfies Block
```

### Entity Layer (Map)

```ts
{
  type: 'entity-layer',
  entityLayer: {
    entityKey: 'relatedEntity',
    itemsAccessor: {
      accessorKey: 'allEntities.relatedEntity',
      filters: [
        { key: 'meta.parentId', contextAccessorKey: 'currentEntity.id' },
      ],
    },
  },
} satisfies MapBlock
```

### Tabs with Nested Blocks

```ts
{
  type: 'tabs',
  tabs: {
    variant: 'underlined',
    items: [
      {
        label: 'Overview',
        value: 'overview',
        icon: 'dashboard',
        blocks: [/* nested blocks */],
      },
    ],
  },
} satisfies Block
```

## Validation Checklist

- Block type is valid (exists in BlockType or MapBlockType)
- Accessor keys reference valid context paths
- Field names match meta definitions (for attributes-list)
- Entity keys exist in entitiesConfig (for relation blocks)
- TypeScript types compile correctly
- No undefined access; use optional chaining where needed
- Conditional logic uses proper accessor keys or formulas
- Icons are valid lucide icon names
- Map blocks reference valid entity keys for entity-layer
- Blocks are added to correct array (multiple/single/map)

## Conventions to Follow

- Use `satisfies Block` or `satisfies MapBlock` for type safety
- Accessor keys should use dot notation: `currentEntity.meta.fieldName`
- Always check meta.ts to verify field names exist
- For filters, use `contextAccessorKey` to reference current entity
- Use descriptive labels and appropriate icons
- Group related blocks with tabs or rows when appropriate
- Ask for clarification rather than guessing field names or accessor paths
- Support both adding individual blocks and scaffolding complete files
- Handle high-level descriptions with interpretation and questions
- Handle low-level descriptions with validation and improvements

## Notes

- When user says "show X field", check meta.ts for exact field name
- For "show related entities", ask for entityKey and filter criteria
- Map blocks are separate from regular blocks - use mapBlocks array
- Tabs can contain nested blocks - parse tab structure from description
- Conditional blocks use `enabledAccessorKey` or `enabledConditions`
- Role-based visibility uses `roles` array on block
- Reference actual block component files to understand required props
- Support multi-block descriptions by parsing and asking for clarification on each
- For low-level code, validate structure and suggest type-safe improvements
