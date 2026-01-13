# New Tenant App (Generator)

## Purpose

- Generate a new tenant app by scaffolding files from the template and setting up the necessary folder structure, app config, and route handlers. Entities should be created separately using the `new-entity` command.

## Inputs (ask me for these when running)

**Required:**

- tenantSlug (e.g. "new-tenant") - kebab-case slug for the tenant
- tenantName (e.g. "New Tenant") - display name for the tenant
- tenantId (e.g. "tenant-123") - database tenant ID (required, no placeholder)
- mapBounds (array of 4 numbers) - maxBounds for map config [minLng, minLat, maxLng, maxLat] (required)
- country (optional, e.g. "Colombia", "Mexico") - if a country is mentioned, add admin boundaries with ISO 3166-1 alpha-3 country code (e.g. "COL", "MEX")

**Optional:**

- organization (optional, e.g. "Org Name") - organization name
- logo (optional, e.g. "tenant-logo.png") - logo filename (defaults to "restoration-scope.png")
- basePath (optional, e.g. "/new-tenant") - base URL path (defaults to "/{tenantSlug}")
- defaultPath (optional, e.g. "/dashboard") - default route path (defaults to "/entity" or leave empty)
- groupFolder (optional, e.g. "(alegria)") - group folder name if tenant should be grouped (otherwise creates as direct tenant)

## Template source

- Use files under `~/app/(tenants)/_template_simple/`:
  - `[[...path]]/page.tsx` - catch-all route handler
  - `app-config.ts` - main app configuration
  - `pages/root-page/` - template root page config (optional, can be added later)

Related types (clickable in Cursor):

- [AppConfig](mdc:src/types/app-config.types.ts)
- [EntityConfig](mdc:src/types/entity-config.types.ts)
- [PageConfig](mdc:src/types/entity-config.types.ts)

## Placement strategy

- If `groupFolder` is provided: create at `src/app/(tenants)/{groupFolder}/{tenantSlug}/`
- Otherwise: create at `src/app/(tenants)/{tenantSlug}/`
- Detect existing structure and follow tenant's organizational pattern
- Check if tenant already exists and warn/error appropriately

## Steps to perform

1. Create directory structure

- Create tenant directory at determined path
- Create `[[...path]]/` subdirectory for route handler
- Create `pages/` folder for root page config (optional, can be deferred)

2. Create route handler file

- Copy `[[...path]]/page.tsx` from `/_template_simple/[[...path]]/page.tsx` into `/{tenantSlug}/[[...path]]/page.tsx`
- Ensure it imports from `../app-config` (relative path)

3. Create app-config.ts

- Copy `app-config.ts` from `/_template_simple/app-config.ts` into `/{tenantSlug}/app-config.ts`
- Replace placeholders:
  - `slug`: tenantSlug
  - `tenantId`: tenantId (required, no placeholder)
  - `logo`: logo or default "restoration-scope.png"
  - `basePath`: basePath or `/{tenantSlug}`
  - `defaultPath`: defaultPath or `/entity` (or leave empty/comment out)
  - `nav.list`: leave empty array or comment out (entities will be added later via new-entity command)
  - `tenant.name`: tenantName
  - `tenant.organization`: organization if provided
  - `map.props.maxBounds`: mapBounds (required, always include)
  - `map.adminBoundaries`: if country is mentioned, add `adminBoundaries: { countryCode3: 'XXX' }` where XXX is the ISO 3166-1 alpha-3 country code (e.g. 'COL' for Colombia, 'MEX' for Mexico)
- Leave `entitiesConfig` empty initially (entities will be added via the `new-entity` command):

```ts
import type { AppConfig } from '~/types'

export const appConfig = {
  slug: 'new-tenant',
  tenantId: 'tenant-123',
  logo: 'restoration-scope.png',
  basePath: '/new-tenant',
  defaultPath: '/entity',

  tenant: {
    name: 'New Tenant',
    organization: 'Org Name',
  },

  nav: {
    list: [], // Entities will be added using the new-entity command
  },

  map: {
    props: {
      maxBounds: [minLng, minLat, maxLng, maxLat], // Required: always include map bounds
    },
    basemaps: {
      blackAndWhite: false,
    },
    // Add admin boundaries if country is mentioned
    // adminBoundaries: {
    //   countryCode3: 'COL', // ISO 3166-1 alpha-3 country code
    // },
  },

  entitiesConfig: {},
} satisfies AppConfig
```

4. Create root page config (optional, can be deferred)

- Copy `pages/root-page/` from `/_template_simple/pages/root-page/` if user wants a dashboard/root page
- Wire into app-config.ts `pages.rootPage`:

```ts
import { pageConfig as rootPageConfig } from './pages/root-page/app-page'

export const appConfig = {
  // ...
  pages: {
    rootPage: rootPageConfig,
  },
} satisfies AppConfig
```

5. Setup tenant assets (note for user)

- Mention that tenant assets should be set up separately using `setupTenantAssetsFolder` helper
- Reference `public/tenant-apps/{tenantSlug}/` structure
- Note: This can be done manually or via script, not automatically scaffolded

## Validation checklist

- Types compile: newly added imports resolve
- Tenant appears accessible at `/{basePath}` route
- Visiting `/{basePath}` renders without runtime errors
- App config satisfies AppConfig type
- No undefined access; prefer optional chaining from the root (e.g. `obj?.child?.leaf`)
- Lints pass on edited files
- Route handler correctly imports app-config

## Conventions to follow

- Naming: never abbreviate; use kebab-case for slugs, camelCase for keys
- No default exports. Keep higher-level objects/functions at the top of the file
- Use early returns and optional chaining. Avoid non-null assertions
- Follow existing tenant app patterns for consistency
- For grouped tenants, ensure the group folder exists or create it if needed

## Notes

- The command should detect if tenant already exists and warn/error appropriately
- For grouped tenants, ensure the group folder exists (create it if it doesn't)
- **Entities should be created separately using the `new-entity` command** - mention this to the user after scaffolding
- Tenant assets (icons, manifests) should be set up separately - mention this in output
- **Map bounds are required** - always include `map.props.maxBounds` in the app config
- The nav.list should be empty initially - entities will be added via the new-entity command which automatically wires them into nav
- The defaultPath can be set to `/entity` or `/dashboard` initially, and updated later once entities are created
