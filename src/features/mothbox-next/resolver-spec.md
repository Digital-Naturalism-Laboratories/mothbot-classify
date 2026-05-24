# Classification resolver (v1)

Per `patch_id`, pick the winning row across all `03_classifications/*.ndjson` files.

## Winner selection

1. Prefer the row with the latest non-null `classified_at` timestamp.
2. If the candidate has a timestamp and the incumbent does not, the candidate wins.
3. If the incumbent has a timestamp and the candidate does not, the incumbent wins.
4. If both have timestamps, the later timestamp wins.
5. If timestamps are equal or both missing, human (`classifier_type: human`) beats bot.
6. Per-classifier source files are never deleted during merge; only `02_records/current-classifications.ndjson` is rewritten as a derived cache on save/import.

## Accept semantics

`classification_type: accept` preserves taxon from the row; mapped to `detectedBy: user` without inventing new taxonomy.

## Bot null timestamps

Bot rows may have `classified_at: null`. Any human row with a timestamp beats bot null. Human rows without timestamps still beat bot when timestamps are both absent (human tie-break).
