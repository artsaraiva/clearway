# Issue tracker: GitHub Issues

Tickets live in GitHub Issues at [`artsaraiva/clearway`](https://github.com/artsaraiva/clearway/issues). Specs, ADRs and maps stay in the repo.

## Access

Use the `gh` CLI with `-R artsaraiva/clearway`. The repo belongs to the personal account `artsaraiva`, which may not be the active `gh` account on this machine:

- `git push` / `git fetch` already authenticate as `artsaraiva` through a repo-local credential helper in `.git/config`.
- For `gh` commands, prefix `GH_TOKEN=$(gh auth token -u artsaraiva)`. Never switch the global active account.

## Conventions

- One issue per ticket. The title starts with its effort: `Road network: …`, `Player tools: …`, `District 1: …`. Grilling tickets start with `Grill: …`.
- The body opens with a `**Type:**` line (`task`, `grilling`, `research` or `prototype`) and, when blocked, `**Blocked by:** #a, #b`.
- Triage state is a label, exactly one per open issue (see `triage-labels.md`). Grilling tickets take `ready-for-human`.
- Blocking also uses GitHub's native relationship, so the issue page shows it: `gh api -X POST repos/artsaraiva/clearway/issues/<n>/dependencies/blocked_by -F issue_id=<blocker's database id>` (the `id` field from `gh api repos/artsaraiva/clearway/issues/<blocker>`).
- Comments and conversation history are issue comments.
- Specs live at `.scratch/<feature>/spec.md`. A spec's `## Issues` section links its GitHub issues.
- In repo markdown, write issue references as full links (`[#4](https://github.com/artsaraiva/clearway/issues/4)`); a bare `#4` only links inside GitHub issues and PRs.

## When a skill says "publish to the issue tracker"

`gh issue create -R artsaraiva/clearway -t "<Effort>: <title>" -F <body file> -l <triage label>`, then add the blocked-by relationships.

## When a skill says "fetch the relevant ticket"

`gh issue view <n> -R artsaraiva/clearway --json title,body,comments`. Plain `gh issue view` prints nothing in a non-interactive shell, so an empty result means the command, not the ticket, is wrong. The user will normally pass the issue number.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file in the repo; its **children** are GitHub issues.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body). The game's map is `.scratch/game/map.md`.
- **Child ticket**: a GitHub issue with the question in the body and a `**Type:**` line (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: native blocked-by relationships. A ticket is unblocked when all its blockers are closed.
- **Frontier**: open, unblocked, unassigned issues; lowest number first (`gh issue list -R artsaraiva/clearway --state open`).
- **Claim**: assign it (`gh issue edit <n> -R artsaraiva/clearway --add-assignee artsaraiva`) before any work.
- **Resolve**: post the answer as a comment headed `## Answer`, close the issue as completed, then append a context pointer (gist + issue link) to the map's Decisions so far.

Resolved tickets from before the move to GitHub stay in `.scratch/<effort>/issues/` as records.
