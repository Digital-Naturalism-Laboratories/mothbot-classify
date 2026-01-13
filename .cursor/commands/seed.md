# Seed Entity Data

## Purpose

- Generate and insert seed data into any entity table using the seeding script.

## Inputs (ask me for these when running)

- tenantId (e.g. "zemeoxykcqoyoxp") — found in the tenant's `app-config.ts`
- table (e.g. "people", "polygons", "points") — the database table name
- tableType (optional) — filter by entity type if the table holds multiple entity types
- description of the data to generate (e.g. "10 Costa Rican coffee farmers", "5 reforestation sites in Panama")

## Script location

- [seed-entities.ts](mdc:scripts/seed-entities.ts)

## How to run

```bash
bun run scripts/seed-entities.ts \
  --tenantId <tenant_id> \
  --table <table_name> \
  --tableType <type> \
  --data '[{...}, {...}]'
```

## Data format

Each item in the data array should have:

- `meta`: Object containing all meta fields (e.g. `name`, `region`, `phone_number`)
- Root-level fields: Optional fields like `externalId`, `projectId`, `siteId`

```json
[
  {
    "meta": {
      "name": "Carlos Jiménez",
      "region": "guanacaste",
      "phone_number": "+506 8456-7890"
    },
    "externalId": "EXT-001"
  }
]
```

## Steps to perform

1. **Get tenant info**
   - Find the tenant's `app-config.ts` to get `tenantId`
   - Identify which entity/table to seed

2. **Check meta definitions**
   - Look at the entity's `meta.ts` to understand available fields
   - Note field types, required fields, and select options

3. **Generate realistic data**
   - Create contextually appropriate data based on user description
   - Use proper formats for dates (ISO), phone numbers, etc.
   - Match select field values to defined options
   - Skip image/attachment fields unless user provides files

4. **Run the seed command**
   - Execute the script with generated JSON data
   - Verify success/failure output

## Example workflow

User asks: "Seed 5 properties in Guanacaste for the demo tenant"

1. Check `src/app/(tenants)/(secondary)/demo/app-config.ts` → tenantId: `zemeoxykcqoyoxp`
2. Check `src/app/(tenants)/(secondary)/demo/entities/properties/meta.ts` for fields
3. Generate 5 property records with realistic Costa Rican data
4. Run:

```bash
bun run scripts/seed-entities.ts \
  --tenantId zemeoxykcqoyoxp \
  --table polygons \
  --data '[{"meta": {"name": "Finca La Esperanza", ...}}, ...]'
```

## Common tables

| Entity Type                   | Table      | Notes            |
| ----------------------------- | ---------- | ---------------- |
| People (land owners, farmers) | `people`   |                  |
| Properties, sites, plots      | `polygons` | Polygon geometry |
| Trees, points of interest     | `points`   | Point geometry   |

## Notes

- The script auto-generates `id`, `createdAt`, `updatedAt`, and `createdBy`
- If meta has `latitude` and `longitude`, point geometry is auto-created
- Field names in meta should be snake_case (e.g. `phone_number`, not `phoneNumber`)
- Always check the entity's meta.ts for exact field names and options
