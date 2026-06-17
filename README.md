# Mothbot Classify

A local-first application for labeling and classifying insect photos captured by Mothbot hardware. You can use it by just going to 

```
https://dev-classify.mothbox.org/
```

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+)

- Chrome or Edge or other Chromium -like browsers (unfortunatley we currently have issues with trying to use firefox)

## Getting Started

Want to run this locally? Go to the local repo and run these commands:
```bash
# Install dependencies
bun install

# Start development server
bun dev
```
a browser window pointing to http://localhost:5173 should automatically pop up and load the classify program.

or build for production
```
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
