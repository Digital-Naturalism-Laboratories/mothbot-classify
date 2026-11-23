# Determination algorithm `mothbox-default/1`

The ontology's Determination: the best guess of what an occurrence is, picked from its identifications (every row in every `03_classifications/*.ndjson` file). Code: `resolve-classifications.ts`.

## Grouping

Rows are grouped by occurrence: `occurrence_id` on the row, else the patch's `occurrence_id` from `02_records/patches.ndjson`, else the `patch_id` itself. Until tracking merges detections, every occurrence holds one patch. Every patch of an occurrence gets the occurrence's determination.

## Withdrawals

A row with `classification_type: withdrawn` takes back all of that classifier's earlier rows for the occurrence. "Earlier" means an earlier `classified_at`, or the same timestamp and an earlier position in the files. Withdrawal rows are never a determination themselves.

## Picking the determination

1. If any human (`classifier_type` other than `bot`) identification remains, take the latest: highest `classified_at`, a missing timestamp counting as oldest, and a later position in the files winning a tie. Classify appends rows, so a later row is a newer claim.
2. Otherwise take the latest machine row: a row with a timestamp beats one without, a later timestamp beats an earlier one, and on a tie the first row seen wins. Adapters mark a preferred machine algorithm with `classified_at: 1` and leave the rest `null`, so the preferred one wins.
3. If nothing remains, the occurrence has no determination.

Each resolved row records `determination_algorithm: mothbox-default/1` and `determined_from` (the id of the chosen identification; see `identificationIdOf`).

## Changes from the earlier resolver (v1)

The earlier resolver took the latest timestamp across humans and machines, and used "human beats machine" only to break ties. Now any human identification beats every machine identification.

## Files

- Per-classifier files in `03_classifications/` are append-only: Classify adds a row for each change (`persist/persist-human-classifications.ts`) and never deletes one.
- `02_records/current-classifications.ndjson` is a cache of the determinations, rewritten on save and import.

## Accept

`classification_type: accept` is the Agree action. It keeps the taxon of the identification it agrees with, and `agreed_with` holds that identification's id. It is mapped to `detectedBy: user` without inventing new taxonomy.
