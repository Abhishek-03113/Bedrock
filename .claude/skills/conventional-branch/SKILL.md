---
name: conventional-branch
description: Name git branches per the Conventional Branch spec (https://conventionalbranch.org, v1.1.0). Use whenever creating, renaming, or proposing a git branch in this repo, including branches for PRs, agent/worktree branches, and when a harness pre-assigns an auto-generated branch name (e.g. claude/<random-words>), which must be renamed to a descriptive conventional name before pushing.
---

# Conventional Branch naming

Every branch in this repo follows [Conventional Branch 1.1.0](https://conventionalbranch.org).

## Format

```
<type>/<description>
```

Only the trunk branches `main`, `master` and `develop` have no prefix.

## Types (use a purpose prefix)

| Prefix | Use for |
|---|---|
| `feature/` (alias `feat/`) | New features, UI revamps, new screens |
| `bugfix/` (alias `fix/`) | Bug fixes |
| `hotfix/` | Urgent production fixes |
| `release/` | Release prep, e.g. `release/v1.2.0` |
| `chore/` | Non-code work: deps, docs, repo cleanup, renames, CI |

The spec also allows agent-source prefixes (`ai/`, `claude/`, `codex/`, `copilot/`, `cursor/`). **This repo uses purpose prefixes, even for work done by an AI agent.** The type says *what* the change is, not *who* made it.

## Rules

1. Use only lowercase letters, digits and hyphens. Dots are allowed only between alphanumerics, mainly in release versions.
2. No uppercase, underscores, spaces or other symbols.
3. No consecutive hyphens or dots. The description can't start or end with a hyphen or dot, and a hyphen can't touch a dot.
4. The description must say what the work is. Keep it short (2–5 words) and descriptive.
   - Good: `feature/bedrock-hig-revamp`, `fix/remote-reconnect-loop`, `chore/rename-to-bedrock`
   - **Never** use random or generated names such as `claude/pensive-edison-n049b3`, `feature/update`, `fix/stuff` or `feature/wip`.
5. If there's a ticket or issue, put its number in the description: `feature/issue-123-pairing-qr`.

## Procedure

1. Pick the type from the dominant intent of the change. If a change mixes intents, pick the one users would notice, e.g. a UI revamp plus cleanup → `feature/`.
2. Write a 2–5 word kebab-case description.
3. Validate: `.claude/skills/conventional-branch/scripts/check-branch.sh <name>` (no argument = current branch).
4. Create the branch: `git switch -c <name>`. To rename one: `git branch -m <old> <new>`.
5. If the session pre-assigned a non-conforming branch (e.g. a random `claude/...` name), rename it before the first push. Push the new name with `git push -u origin <new>`. If the old name was already pushed and you created it, delete the remote copy (`git push origin --delete <old>`). Tell the user about the rename.
