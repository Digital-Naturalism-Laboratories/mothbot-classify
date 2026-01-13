# Commit mode (All Working Directory Changes)

**CRITICAL: This command commits ALL modified files in the working directory, regardless of when they were changed. Use this when you want to commit everything that's staged or unstaged.**

- Instruction:
  - 1. Look at the past few commits and process pattern of commit messages.
  - 2. Check the current working directory using `git status` to see ALL modified, added, or deleted files.
  - 3. Figure out how many commits might be necessary and which files are linked to each commit based on ALL changes in the working directory.
  - 4. For each commit come up with a message.
  - 5. Before committing, list all files you're about to commit (from git status output).
  - 6. **Run tests related to changes**: For each modified file, check if a corresponding test file exists (e.g., `src/utils/foo.ts` → `src/utils/__tests__/foo.test.ts`). Run relevant tests using `bun run test <test-file-path> --run` (never use watch mode). If tests fail, report the failures before fixing them.
  - 7. Finally make the commits using appropriate git add commands (can use `git add .` or `git add -A` if commits should include all changes).
- Format: {context or tenant short name} - {commit message}. E.g. "Core - improve filters", or "Azuero - add new fields", or "Landing - fix copy"

- Undefined/null safety checklist (before committing):
  - Scan changed lines for potentially undefined access. Prefer optional chaining from the root: use `obj?.child?.leaf` and `obj?.[key]` for dynamic keys.
  - Guard config-driven keys and values: verify presence and type before use (e.g., `if (!entityConfig?.urlIdField || typeof entityConfig.urlIdField !== 'string') return`).
  - When reading nested map/libre features, default intermediate objects: `const properties = feature?.properties ?? {}` then read from `properties`.
  - Avoid non-null assertions (`!`). Narrow instead with early returns or type guards.
  - Use nullish coalescing for safe defaults: `const value = maybeNullish ?? fallback`.
  - Double-check dynamic bracket access always uses optional chaining: `source?.[key]` not `source[key]`.
  - Prefer early returns on missing data to reduce nesting and runtime surprises.

- Test checklist (before committing):
  - Identify test files related to modified source files (check for `__tests__/` directories or `*.test.ts` files).
  - Run tests using `bun run test <test-file-path> --run` (never use `bun test` or watch mode).
  - If tests fail, report all failures with details before attempting fixes.
  - Ensure all related tests pass before proceeding with commits.

- Never push, or create new branches, or PRs without my explicit instruction
