## Agent skills

### Issue tracker

Tickets are GitHub Issues at `artsaraiva/clearway`; specs and maps stay under `.scratch/<feature>/`. The repo is on the personal `artsaraiva` account: prefix `gh` with `GH_TOKEN=$(gh auth token -u artsaraiva)`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Testing

Most of this game is verified by playtesting. Tests cover the simulation, where playtesting misses regressions.

These test seams are pre-agreed with the user and form the complete list:

- **Simulation outcomes** (`src/sim`): a Level jams with its initial configuration, a known Change clears the jam, and a seed gives the same result every run.
- **Levels** (`levels/`): each Level jams at start and its reference solution clears it.

Assert outcomes only: jammed, cleared, won. Verify everything else (`src/render`, `src/ui`, visuals, feel, tuning) by running the game.

Write the test first when the rule is clear up front. When the behavior is still being explored, build it, playtest it, then lock it in with a test.
