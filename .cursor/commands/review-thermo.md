---
name: review-thermo
description: Thermo-nuclear maintainability review of current branch changes (strict rubric, optional Task subagent)
---

Use the `thermo-nuclear-code-quality-review` skill. If that skill is unavailable, follow the instructions below.

Run a **thermo-nuclear** code quality review of the **current branch** changes against the default base branch `main` (use another base only if the user names one).

## Scope

- Review the implementation diff and the full contents of changed files.
- Ignore unrelated worktree changes unless the user explicitly asks to include them.
- Do not approve on behavior alone; apply the skill’s structural bar (code-judo, 1k-line rule, spaghetti growth, boundaries, canonical layers).

## Orchestration

1. In **one** message, launch two readonly `Task` calls in parallel:
   - `subagent_type: "shell"` — collect `git diff <base>...HEAD`, merge-base summary, and file list.
   - `subagent_type: "explore"` — read full contents of every changed file (not just the diff hunks).
2. Invoke `subagent_type: "thermo-nuclear-code-quality-review"` with a single user prompt containing:
   - `### Git / diff output`
   - `### Changed file contents`
3. If the custom subagent is unavailable, perform the review in this thread using the skill rubric directly (same output ordering and approval bar).

## Output

Return findings in the skill’s priority order. Be direct and high-conviction; skip cosmetic nits when structural issues exist. End with an explicit **approve** or **request changes** against the skill’s approval bar.
