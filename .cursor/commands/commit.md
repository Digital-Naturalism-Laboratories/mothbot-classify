# Commit mode (Conversation Scope Only)

**CRITICAL: This command commits ONLY files modified during the current conversation. NEVER commit files not explicitly touched or modified in this conversation.**

- Instruction:
  - 1. Look at the past few commits and process pattern of commit messages.
  - 2. **Review the current conversation history and identify ONLY files that were explicitly modified, created, or edited during this conversation.**
  - 3. **VERIFY scope**: Before committing, verify that every file in your commit list was actually modified in this conversation by checking:
    - Files that were edited using search_replace, write, or edit_notebook tools
    - Files explicitly mentioned in the conversation as being changed
    - Cross-reference with git status to ensure you're not including unrelated changes
  - 4. Figure out how many commits might be necessary and which files are linked to each commit. It's totally ok to have many files on a single commit. I would like to have many files relating to one conversation be all together in a commit.
  - 5. For each commit come up with a message.
  - 6. **Before committing, list the files you're about to commit and verify they match the conversation scope.**
  - 7. **Run tests related to changes**: For each modified file, check if a corresponding test file exists (e.g., `src/utils/foo.ts` → `src/utils/__tests__/foo.test.ts`). Run relevant tests using `bun run test <test-file-path> --run` (never use watch mode). If tests fail, report the failures before fixing them.
  - 8. Finally make the commits using `git add <specific-files>` (never use `git add .` or `git add -A`).
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
