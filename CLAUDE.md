@AGENTS.md

# User manual maintenance

`docs/USER_MANUAL.md` is the maintained, user-facing manual for this app — the single
source of truth (no separate copy exists elsewhere). Whenever you ship a change that adds,
removes, or alters what a user can do or how they do it (a new feature, a changed workflow,
a renamed setting, a removed capability), update the relevant section of
`docs/USER_MANUAL.md` in the same change, and bump its "Last updated" line (date + version).
Skip it for changes with no user-visible effect (refactors, bug fixes that just restore
documented behavior, internal/infra work).
