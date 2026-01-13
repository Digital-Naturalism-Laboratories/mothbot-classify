# Council and Clean

Review changes through multiple engineering perspectives, then execute a structured cleanup.

## Phase 1: Council Review

Convene a "council of engineers" to evaluate the implementation from different angles:

### 1. Architecture Perspective

- Does the code flow make sense?
- Are there symptomatic fixes vs systemic solutions?
- Is the abstraction level appropriate?

### 2. Maintainability Perspective

- Will this be easy to understand in 6 months?
- Are there duplications across the codebase?
- Does this follow existing patterns in the project?

### 3. Performance Perspective

- Are there unnecessary re-renders or computations?
- Any memory concerns (global state, uncleaned effects)?
- Is there redundant work being done?

### 4. Risk Assessment

- What could break?
- Are edge cases handled?
- Is the change backward compatible?

### Council Output

Produce a brief summary of findings with:

- ✅ What's good about this implementation
- ⚠️ Concerns or potential issues
- 🔧 Suggested improvements (prioritized)

---

## Phase 2: Safe Cleanup

Execute improvements identified by the council.

### Prevent Duplication

- Check if newly exported functions already exist elsewhere (including lodash/utils)
- If overlap exists but with meaningful differences, keep separate and note it

### Function Organization

- High-level/entry functions at the top
- Atomic/helper functions at the bottom
- Extract agnostic logic blocks into helper functions

### De-Slop

Remove AI-generated noise:

- Unnecessary comments that don't add context
- Defensive checks abnormal for the codebase
- Casts to `any` to bypass type issues
- Style inconsistencies with the file

### Code Quality

- [ ] Code is readable and well-structured
- [ ] Functions are small and focused
- [ ] Variable names are descriptive
- [ ] No code duplication
- [ ] Follows project conventions

### Execution Process

1. List the improvements to make
2. Identify logic flows impacted by each change
3. Execute improvements one at a time
4. Verify logic flow remains intact after each change
5. Confirm function ordering is correct

**⚠️ If anything breaks or seems risky, stop and report.**

---

## Phase 3: Report

Provide a concise summary:

- Council findings (1-2 sentences)
- Changes made (1-3 sentences)
- Any remaining concerns or follow-up items
