# Coding Standards

Judgement calls the reviewer enforces. Mechanical rules belong in automated checks (`.husky/pre-commit`), not here.

## Names come from the glossary

Name modules, types, functions and fields with the terms in `GLOSSARY.md`: a `Gateway` is a `Gateway`, not a spawn point. Flag:

- a name the glossary lists under _Avoid_ (`npm run lint:glossary` already refuses District, street for a Road, entrance, Piece, and Framed, Street and Close for the zooms on added lines; the rest are ordinary words that need your judgement)
- a concept with no glossary term (pick an existing term, or note the gap for `/domain-modeling`)
- a name whose glossary term is narrower than what the code does, such as a class named after a concept that also does a second job

## `ponytail:` comments mark deliberate shortcuts

A `ponytail:` comment records a simplification made on purpose. It names the ceiling (what breaks, and when) and the upgrade path. Treat it as accepted debt, not a defect. Flag a `ponytail:` comment missing its ceiling or upgrade path, and flag a shortcut with a known ceiling that carries none.
