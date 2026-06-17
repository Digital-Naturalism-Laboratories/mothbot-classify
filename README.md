# Mothbot Classify

A local-first application for labeling and classifying insect photos captured by Mothbot hardware.

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+)

## Getting Started

```bash
# Install dependencies
bun install

# Start development server
bun dev

# Build for production
bun build
```

The dev server runs at `http://localhost:5173` by default.

## Usage

Load a project folder with the following structure:

```
projects/
  └── {project}/
      └── {Species}/
          ├── {Species_list_fromGBIF}.csv
      └── {site}/
          └── {deployment}/
              └── {night}/
                  ├── {photo_sourceImageA}.jpg
  └── _processed

      └── {project}/
          └── {site}/
              └── {deployment}/
                  └── {night}/
                      ├── {photo_sourceImageA}__{index}_{model}.jpg
                      ├── {photo_sourceImageA}_botdetection.json

```

The app lets you navigate through this hierarchy, view AI-detected insects, and approve or further classify each detection.

For **Mothbox Next packages** (`dataset.json`, `01_patches/`, NDJSON records), see `docs/mothbox-next-package.md` and use **Migrate legacy dataset…** in the app nav.

## Agent context

Routing and domain language: [`CONTEXT-MAP.md`](CONTEXT-MAP.md) → local `CONTEXT.md` files under `src/features/`.
