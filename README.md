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
      └── {site}/
          └── {deployment}/
              └── {night}/
                  ├── {photo}.jpg
                  ├── {photo}_botdetection.json
                  └── patches/
                      └── {photo}_{index}_{model}.jpg
```

The app lets you navigate through this hierarchy, view AI-detected insects, and approve or further classify each detection.
