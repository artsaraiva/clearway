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

## Project

Every issue sits on the [Clearway project](https://github.com/users/artsaraiva/projects/2): project `2`, owner `artsaraiva`. `gh project` commands need the `project` scope on the `artsaraiva` token; when one reports it missing, ask the user to add it.

Its fields are single-select:

- **Status**:
  - `Backlog`: not scheduled. Open Grills wait here until the user picks one. A project workflow adds each new open issue here on its own.
  - `Todo`: unblocked and ready to start.
  - `Blocked`: has an open blocker.
  - `In progress`: claimed.
  - `Done`: closed. GitHub sets it when the issue closes.
- **Kind**: the body's `**Type:**` line (`task` → `Task`, `grilling` → `Grill`, `research` → `Research`, `prototype` → `Prototype`). GitHub reserves the name "Type".
- **Effort**: the title prefix. A Grill gets the Effort it leads to once it is grilled; an open Grill has none. A new effort needs a new option on the field first.

`Blocked` moves by hand: when an issue closes, move each issue it blocked to `Todo` once all of that issue's blockers are closed.

To set a field, take the item id from `item-add`, then edit it. `item-add` returns the existing item when the issue is already on the project, so the same two lines add an issue and change one. Field and option ids come from `gh project field-list 2 --owner artsaraiva --format json`, the project id from `gh project view 2 --owner artsaraiva --format json --jq .id`.

```sh
item=$(gh project item-add 2 --owner artsaraiva --url <issue url> --format json --jq .id)
gh project item-edit --project-id <project id> --id "$item" --field-id <field id> --single-select-option-id <option id>
```

Views (Board, Grills, Efforts) can be created with `gh api -X POST users/artsaraiva/projectsV2/2/views`, but no API edits or deletes one; the user changes them in the browser.

## When a skill says "publish to the issue tracker"

`gh issue create -R artsaraiva/clearway -t "<Effort>: <title>" -F <body file> -l <triage label>`, then add the blocked-by relationships, then add it to the [project](#project) with Kind, Effort, and a Status of `Todo`, `Blocked` when it has an open blocker, or `Backlog` for a Grill.

## When a skill says "fetch the relevant ticket"

`gh issue view <n> -R artsaraiva/clearway --json title,body,comments`. Plain `gh issue view` prints nothing in a non-interactive shell, so an empty result means the command, not the ticket, is wrong. The user will normally pass the issue number.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file in the repo; its **children** are GitHub issues.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body). The game's map is `.scratch/game/map.md`.
- **Child ticket**: a GitHub issue with the question in the body and a `**Type:**` line (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: native blocked-by relationships. A ticket is unblocked when all its blockers are closed.
- **Frontier**: open, unblocked, unassigned issues; lowest number first (`gh issue list -R artsaraiva/clearway --state open`).
- **Claim**: assign it (`gh issue edit <n> -R artsaraiva/clearway --add-assignee artsaraiva`) and set its Status to `In progress` before any work.
- **Resolve**: post the answer as a comment headed `## Answer`, close the issue as completed, move what it unblocked to `Todo` (see [Project](#project)), then append a context pointer (gist + issue link) to the map's Decisions so far.

Resolved tickets from before the move to GitHub stay in `.scratch/<effort>/issues/` as records.
