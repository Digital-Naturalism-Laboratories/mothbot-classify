# Code Clean up

Check the diff against main, and clean up the code

## Purpose

- review the target code, most likely the current file or a portion of code
- your goal is to do a lightweight round of organization and clean up.
- if you see logic blocks that are agnostic, please turn them into helper functions at the bottom of the file.
- VERY IMPORTANT. You will alos make sure that the top high level/entry functions go at the top, all atomic/helper functions go at the bottom.

### Prevent duplication

- You will make sure that there's no code duplication
- Newly added functions that are exported should be assesed across the codbase to see if the same fn exist already. Potentially libraries like lodash can already handle that.
- When decided to prevent duplication you will make the right tradoff between making things overly complex for the sake of abstractions. That is, if two fns have some difference between them but some amount of overlap it might make more sense to keep them as is. If this situation arise, mention it.

### Safe Clean up

Check the diff against main, and remove all AI generated slop introduced in this branch.

- BY NO MEANS YOU CAN'T BREAK EXECUTION FLOW. To ensure that you will:
  1. make a list of the improvmeents
  2. make a list of the logic flow that will be impacted by the improvement lines
  3. execute the improvements
  4. verify the logic flow is intact.
     If by some raeson you break something or are concerned something might have gone wrong you will say so
  5. Make sure the function ordering is the file is correct

### De Slop

- Extra comments that a human wouldn't add or is inconsistent with the rest of the file
- Extra defensive checks or try/catch blocks that are abnormal for that area of the codebase (especially if called by trusted / validated codepaths)
- Casts to any to get around type issues
- Any other style that is inconsistent with the file

### Code Quality

- [ ] Code is readable and well-structured
- [ ] Functions are small and focused
- [ ] Variable names are descriptive
- [ ] No code duplication
- [ ] Follows project conventions

### Report

Report at the end with only a 1-3 sentence summary of what you changed
