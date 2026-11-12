# 02 Signal: Junction-wide on/off, with gate test

Type: task
Status: ready-for-agent
Blocked by: road-network 03 (priority junction), player-tools 01

## Goal

Move the Signal from per-Arm to per-Junction and prove it is worth having. Spec: `../spec.md`.

## Changes

- `Signal` is a boolean per Junction. On: every Arm gets green in turn, fixed equal split, Priority rules of that Junction ignored. Off: Priority rules apply.
- Offered on crossroads and T-junctions only.
- `Level.tools` gains `'signal'`.

## Gate test (decides whether Signal ships)

A crossroads Level with two heavy crossing flows:

1. Initial configuration (main/yield, any arrangement) jams: Flow `< 0.50`.
2. Signal on clears it: Flow `≥ 0.80` for 60 sim-seconds.

Tune demand and the split before giving up. If no demand table satisfies both, record the sweep in Comments, set this issue to `wontfix`, remove Signal from `spec.md`, and note in `.scratch/game/map.md` that Level 5 becomes a main-road swap. `.scratch/district-01/spec.md` has the fallback design.

## Comments
