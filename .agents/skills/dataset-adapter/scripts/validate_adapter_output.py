#!/usr/bin/env python3
"""Validate a Mothbox Next package produced by a dataset adapter."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


class ValidationError(Exception):
    pass


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValidationError(f"Missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValidationError(f"Invalid JSON in {path}: {exc}") from exc


def load_ndjson(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as exc:
        raise ValidationError(f"Missing required file: {path}") from exc

    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValidationError(f"Invalid NDJSON in {path}:{line_number}: {exc}") from exc
        if not isinstance(row, dict):
            raise ValidationError(f"Expected object row in {path}:{line_number}")
        rows.append(row)
    return rows


def manifest_path(root: Path, value: str | None, fallback: str) -> Path:
    raw = value or fallback
    return root / raw.strip("/")


def require_keys(row: dict[str, Any], keys: list[str], path: Path, index: int) -> None:
    missing = [key for key in keys if row.get(key) in (None, "")]
    if missing:
        joined = ", ".join(missing)
        raise ValidationError(f"Missing {joined} in {path} row {index}")


def validate_package(root: Path, allow_missing_assets: bool = False) -> dict[str, int]:
    manifest = load_json(root / "dataset.json")
    if manifest.get("format") != "mothbox-next-dataset":
        raise ValidationError("dataset.json format must be mothbox-next-dataset")
    if not isinstance(manifest.get("version"), int):
        raise ValidationError("dataset.json version must be a number")
    dataset_id = manifest.get("dataset_id")
    if not isinstance(dataset_id, str) or not dataset_id:
        raise ValidationError("dataset.json dataset_id is required")

    records = manifest.get("records") or {}
    patches_path = manifest_path(root, records.get("patches"), "02_records/patches.ndjson")
    patch_sources_path = manifest_path(root, records.get("patch_sources"), "02_records/patch-sources.ndjson")
    camera_days_path = manifest_path(root, records.get("camera_days"), "02_records/camera-days.ndjson")
    deployments_path = manifest_path(root, records.get("deployments"), "02_records/deployments.ndjson")
    current_path = manifest_path(root, records.get("current_classifications"), "02_records/current-classifications.ndjson")

    patches = load_ndjson(patches_path)
    if not patches:
        raise ValidationError("patches.ndjson must contain at least one patch")

    patch_ids: set[str] = set()
    camera_day_ids: set[str] = set()
    deployment_ids: set[str] = set()

    for index, patch in enumerate(patches, start=1):
        require_keys(patch, ["patch_id", "dataset_id", "asset_path"], patches_path, index)
        patch_id = str(patch["patch_id"])
        if patch_id in patch_ids:
            raise ValidationError(f"Duplicate patch_id in {patches_path}: {patch_id}")
        patch_ids.add(patch_id)
        if patch.get("dataset_id") != dataset_id:
            raise ValidationError(f"Patch {patch_id} dataset_id does not match manifest dataset_id")
        if patch.get("camera_day_id"):
            camera_day_ids.add(str(patch["camera_day_id"]))
        if patch.get("deployment_id"):
            deployment_ids.add(str(patch["deployment_id"]))

        asset_path = root / str(patch["asset_path"]).strip("/")
        if not allow_missing_assets and not asset_path.exists():
            raise ValidationError(f"Patch asset does not exist for {patch_id}: {asset_path}")

    patch_sources = load_ndjson(patch_sources_path)
    source_patch_ids = {str(row.get("patch_id")) for row in patch_sources if row.get("patch_id")}
    missing_sources = patch_ids - source_patch_ids
    if missing_sources:
        sample = ", ".join(sorted(missing_sources)[:5])
        raise ValidationError(f"Missing patch source rows for patch_id(s): {sample}")
    unknown_sources = source_patch_ids - patch_ids
    if unknown_sources:
        sample = ", ".join(sorted(unknown_sources)[:5])
        raise ValidationError(f"patch-sources contains unknown patch_id(s): {sample}")

    deployments = load_ndjson(deployments_path)
    deployment_record_ids = {str(row.get("deployment_id")) for row in deployments if row.get("deployment_id")}
    missing_deployments = deployment_ids - deployment_record_ids
    if missing_deployments:
        sample = ", ".join(sorted(missing_deployments)[:5])
        raise ValidationError(f"Missing deployment rows for deployment_id(s): {sample}")

    camera_days = load_ndjson(camera_days_path)
    camera_day_record_ids = {str(row.get("camera_day_id")) for row in camera_days if row.get("camera_day_id")}
    missing_camera_days = camera_day_ids - camera_day_record_ids
    if missing_camera_days:
        sample = ", ".join(sorted(missing_camera_days)[:5])
        raise ValidationError(f"Missing camera-day rows for camera_day_id(s): {sample}")

    for row in camera_days:
        deployment_id = row.get("deployment_id")
        if deployment_id and deployment_record_ids and str(deployment_id) not in deployment_record_ids:
            raise ValidationError(f"camera-days references unknown deployment_id: {deployment_id}")

    classification_paths = manifest.get("classification_sources") or []
    if not classification_paths:
        class_dir = root / str((manifest.get("folders") or {}).get("classifications", "03_classifications")).strip("/")
        classification_paths = [str(path.relative_to(root)) for path in sorted(class_dir.glob("*.ndjson"))]

    classification_rows = 0
    for raw_path in classification_paths:
        path = root / str(raw_path).strip("/")
        rows = load_ndjson(path)
        classification_rows += len(rows)
        for index, row in enumerate(rows, start=1):
            require_keys(row, ["patch_id", "classifier_id", "classifier_type", "classification_type"], path, index)
            if str(row["patch_id"]) not in patch_ids:
                raise ValidationError(f"{path} row {index} references unknown patch_id: {row['patch_id']}")

    current_rows = load_ndjson(current_path)
    for index, row in enumerate(current_rows, start=1):
        require_keys(row, ["patch_id", "classifier_id", "classification_type"], current_path, index)
        if str(row["patch_id"]) not in patch_ids:
            raise ValidationError(f"{current_path} row {index} references unknown patch_id: {row['patch_id']}")

    return {
        "patches": len(patches),
        "patch_sources": len(patch_sources),
        "deployments": len(deployments),
        "camera_days": len(camera_days),
        "classification_rows": classification_rows,
        "current_classifications": len(current_rows),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package_root", type=Path)
    parser.add_argument("--allow-missing-assets", action="store_true")
    args = parser.parse_args()

    root = args.package_root.expanduser().resolve()
    try:
        result = validate_package(root, allow_missing_assets=args.allow_missing_assets)
    except ValidationError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1

    print(json.dumps({"status": "pass", "package_root": str(root), **result}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
