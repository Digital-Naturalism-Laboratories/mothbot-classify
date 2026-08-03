# Known Dataset Shapes

This is a working reference from the Desktop samples inspected on 2026-05-31.

## Current Mothbox Next Package

Example: `/Users/bernat/Desktop/Datasets/Cerro_Hoya_Expedition`

- Has `dataset.json`.
- Records live in `02_records/`.
- Classifications live in `03_classifications/`.
- Some packages retain patches in the original source tree instead of copying to `01_patches/`.

## Legacy Mothbot / Dinalab

Examples:

- `/Users/bernat/Desktop/Datasets Raw/Hoya`
- `/Users/bernat/Desktop/Mothbox sample data - April 2026/Mini sample Mothbox dataset (processed)`

Observed pattern:

```text
dataset/
  deployment/
    YYYY-MM-DD/
      source.jpg
      source_botdetection.json
      source_identified.json
      patches/
        source_0_Model.pt.jpg
```

The existing `dinalab-mothbox-v1` adapter handles this shape and patch-images-only folders.

## New Mothbox `_processed`

Concrete sample: `/Users/bernat/Desktop/New Datasets/Cerro_Hoya_Expedition mothbox`

Expected pattern:

```text
dataset/
  Deployment1/
    night-or-device/
      source images
  Deployment2/
    night-or-device/
      source images
  _processed/
    Deployment1/
      night-or-device/
        patch images
        *_botdetection.json
    Deployment2/
      night-or-device/
        patch images
        *_botdetection.json
```

Key difference from legacy Mothbot: processed folders mirror source folders and no longer require `patches/` subfolders.

Adapter approach:

- Treat root paths outside `_processed/` as source photos.
- Treat paths under `_processed/` as generated patch/JSON layer.
- Resolve patch assets beside the processed JSON when `shape.patch_path` still says `patches/<file>`.
- Derive hierarchy by stripping `_processed/` from the processed bot JSON path.
- Resolve a source photo path by stripping `_processed/` from the processed file path and changing `_botdetection.json` to `.jpg`.
- Keep package source layout as in-place unless the user explicitly asks to copy/archive.

## AMI

Concrete sample: `/Users/bernat/Desktop/New Datasets/ami_abms`

Examples:

- `/Users/bernat/Desktop/ami-sample-20260526T135813Z-3-001.zip`
- `/Users/bernat/Desktop/ami-sample.zip`

Observed sample zip counts:

- small sample zip: 408 jpg, 2 parquet, 2 CSV, 2 legacy-style `*_botdetection.json`, 2 other JSON.
- large zip: 41,353 jpg, 3 parquet, 2 CSV, 3 other JSON, 2 legacy-style `*_botdetection.json`.

Observed AMI raw/crop pattern:

```text
ami-sample/
  abms/
    2025/
      denmark/F1/source.jpg
      denmark/G1/source.jpg
      denmark/W1/source.jpg
    _processed/
      2025/
        denmark/F1/source_crop_detectionid.jpg
        denmark/G1/source_crop_detectionid.jpg
        denmark/W1/source_crop_detectionid.jpg
  snapshot_abms_denmark_2025_25.10.0.parquet
```

Parquet schema observed in both Denmark and Netherlands files:

```text
detectionid: string
taxonlevel: string
label: string
labelid: string
score: double
abovethreshold: boolean
algorithm: string
sourceimageid: string
x1, x2, y1, y2: int32
cropurl: string
code: string
year: int32
partnerid: string
projectid: string
wktposition: string
filename: string
deploymentid: string
url: string
timestamp: int64
```

Important AMI mapping:

- `patch_id`: use `detectionid`.
- crop asset: `{filename stem}_crop_{detectionid}.jpg` under `{projectid}/_processed/{year}/{country}/{code}/`.
- source photo: `{projectid}/{year}/{country}/{code}/{filename}` when local, or `url` when remote-only.
- deployment: use a human-readable folder id `{projectid}_{country}_{code}_{year}` for hierarchy; carry upstream `deploymentid`, `code`, `projectid`, country, URLs, and metadata path in patch-source trace fields.
- night/camera day: derive from `timestamp` or filename date.
- classifier id: use selected `algorithm`.
- taxonomy: group all rows for a `detectionid`, but do not merge independent classifier algorithms into one taxon. Select one coherent algorithm/rank label for the bot classification and preserve available algorithm names in extras.
- CSV metadata can be used as a fallback when parquet rows are unavailable, but parquet is the primary AMI metadata source.

Tiny AMI sample also contains legacy-style Mothbot JSON generated from AMI rows:

```text
sample_tiny/dataset/abms/abms_denmark_F1_2025-05-02/YYYY-MM-DD/
  source.jpg
  source_botdetection.json
  patches/
    source_crop_detectionid.jpg
```

Do not assume this legacy-style tiny sample reflects the full AMI source contract; use parquet/CSV as the authoritative AMI metadata.

## Plain Images

Example: `/Users/bernat/Desktop/Datasets/Test`

- No bot metadata.
- Existing setup creates one synthetic leaf: `{dataset_id}__default`.
- UI should show unassigned/manual classification, not machine-identified taxonomy.
