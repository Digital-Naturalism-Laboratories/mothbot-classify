# Collaborating on a dataset (manual handoff)

Instructions-first workflow for sharing a Mothbox Next package between people. No in-app export/import buttons yet — use your **file manager** (File Explorer, Finder, Files, etc.), zip the folder, and share via email, Google Drive, Dropbox, GitHub, USB, or any channel your team uses. Same steps on **Windows, macOS, and Linux**.

Each person uses **Mothbox Classify** with a **datasets folder** — a parent directory that holds one folder per dataset package. Examples:

- macOS / Linux: `~/Mothbox/datasets/`
- Windows: `C:\Users\You\Mothbox\datasets\`

## Roles

| Role | Typical job |
|------|-------------|
| **Sender** | Runs adapter, does first-pass work (e.g. order-level Accept), ships a portable copy |
| **Collaborator** | Receives copy, classifies an assigned taxonomic slice, sends back **one file** |
| **Sender (again)** | Drops returned file into `03_classifications/`, reopens dataset |

Your work is stored under your **classifier id** (session initials in the app, e.g. `bf` → `03_classifications/bf.ndjson`). The bot’s work stays in `03_classifications/_bot.ndjson`.

---

## 1. Sender — what to copy, zip, and send

### Before you zip

1. Finish any in-app work so it is saved (identify/accept writes to **your** `03_classifications/{initials}.ndjson`).
2. In your file manager, open **one dataset package folder** — the folder that contains `dataset.json` at its root (not the whole `datasets/` parent).

Example layout:

```text
dinacon2025/                    ← zip THIS folder (package root)
  dataset.json
  01_patches/
  02_records/
  03_classifications/
  00_source/                     ← usually EXCLUDE from zip (see below)
  04_exports/                    ← optional to exclude
```

### What to include in the zip

| Include | Why |
|---------|-----|
| `dataset.json` | Required to open the package |
| `01_patches/` | Patch images everyone classifies |
| `02_records/` | Patch list, provenance, hierarchy |
| `03_classifications/` | Bot + any human files you want them to see (at minimum `_bot.ndjson`) |

### What to leave out (recommended)

| Exclude | Why |
|---------|-----|
| `00_source/` | Raw photos and nested legacy layout — large, not needed for classification |
| `04_exports/` | Optional exports only |

Typical handoff size without `00_source/`: on the order of **~20–200 MB** (patch count dependent).

### Optional: include your work so far

If the collaborator should continue from your order-accept pass, keep **your** file in the zip, e.g. `03_classifications/bf.ndjson`.  
If they should start only from bot output, you can send only `_bot.ndjson` (still include patches + records).

### How to zip and send

1. Compress the **package folder** to a `.zip` archive:
   - **Windows:** right-click the folder → **Send to** → **Compressed (zipped) folder**.
   - **macOS:** right-click → **Compress “folder name”**, or select the folder and **File → Compress**.
   - **Linux:** right-click → **Compress**, or in a terminal: `zip -r dinacon2025.zip dinacon2025/` (use your folder name).
2. Send the `.zip` however your team shares files (email, cloud storage, Git, USB, etc.).
3. Tell them:
   - which **order / taxonomic group** to focus on (e.g. “all Orthoptera in this dataset”), and
   - your classifier id if you included your `03_classifications/{id}.ndjson` file.

---

## 2. Collaborator — unzip and where to put the folder

### One-time: set datasets folder in the app

1. Open Mothbox Classify.
2. On the home screen, click **Choose datasets folder…** and pick the parent folder you will use (see path examples above). Grant read/write access when the browser prompts you.

### Add the received package

1. **Extract** the archive (double-click the `.zip` on Windows/macOS, or use your file manager / `unzip` on Linux).
2. You should get **one folder** with `dataset.json` inside (same name as the sender’s package, e.g. `dinacon2025/`).
3. **Move or copy** that entire folder into your datasets folder so it sits **alongside** any other datasets:

```text
# macOS / Linux
~/Mothbox/datasets/
  dinacon2025/          ← unzipped package here
  other-dataset/

# Windows
C:\Users\You\Mothbox\datasets\
  dinacon2025\
  other-dataset\
```

4. In the app, click **Refresh datasets**.
5. Open the dataset from the home list (click the row).

### Set your identity

1. Open the avatar menu (top right) → **Change user name…**
2. Enter **initials** (e.g. `ana`). This becomes your classifier id: `03_classifications/ana.ndjson`.

If the sender included their classifications, you should see merged results in the grid (resolver picks latest timestamp per patch; human beats bot on ties).

---

## 3. Collaborator — do the classification work

Work as you normally would in the app:

- Navigate nights / taxonomy for the assigned group.
- **Accept** (`a`) for order-level approval when that is your task.
- **Identify** (`d`) for species / morphospecies / ERROR.

All of your edits accumulate in:

```text
03_classifications/{your-initials}.ndjson
```

Do **not** edit `_bot.ndjson` or someone else’s `{id}.ndjson` by hand unless you know what you are doing.

---

## 4. Collaborator — what to send back to the sender

Send **only your classification file**, not the whole dataset again (unless patches/records changed on your side).

| Send this file | Example |
|----------------|---------|
| `03_classifications/{your-initials}.ndjson` | `03_classifications/ana.ndjson` |

You can zip just that one file or attach it to email. The sender already has patches and records.

Tell the sender your classifier id (`ana`) so they know which file they received.

---

## 5. Sender — import the returned file

1. Make sure your copy of the dataset still lives in **your** datasets folder (same package root as before).
2. Copy the received file into:

```text
your-package/03_classifications/ana.ndjson
```

Replace the file if it already exists (same name = same collaborator; latest file wins on next load).

3. **Reload classifications from disk:** go to the home screen and **open the dataset again** (click the dataset row).  
   If the grid still looks stale, refresh the browser tab and open the dataset once more.

The app resolves all files in `03_classifications/*.ndjson` and updates what you see. Your own `{your-id}.ndjson` is unchanged; the collaborator’s file is added or replaced.

### Repeat rounds

- You keep working → your `bf.ndjson` updates on save.
- They send a new `ana.ndjson` → copy it in again and reopen the dataset.
- For a **new** collaborator, repeat from section 1 (same substrate zip is fine; they only return their own `.ndjson`).

---

## Quick reference

| Step | Who | Action |
|------|-----|--------|
| Prepare | Sender | Save work; zip package **without** `00_source/` |
| Receive | Collaborator | Extract zip into `datasets/{package}/`; Refresh datasets; open; set initials |
| Work | Collaborator | Classify in app |
| Return | Collaborator | Send `03_classifications/{initials}.ndjson` only |
| Merge | Sender | Copy file into `03_classifications/`; reopen dataset |

## Related docs

- Package layout: [`mothbox-next-package.md`](./mothbox-next-package.md)
- Resolver rules: [`../src/features/mothbox-next/resolver-spec.md`](../src/features/mothbox-next/resolver-spec.md)
