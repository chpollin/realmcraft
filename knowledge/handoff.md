---
title: Handoff
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: active
created: 2026-10-03
updated: 2026-10-03
---

# Handoff

This process inbox holds only open hand-over points. Before using a point, check its source and current target. Integrate durable content into the responsible declarative or action document, record subject, source, target and result or reason for discarding briefly in [journal.md](journal.md), and then remove the point completely.

## Open handoff points

### plan-m1.md cites removed docs paths

- Received. 2026-10-03
- Source. Lane D of M1, after merging commit `4f7ed7e`.
- Target. [plan-m1.md](plan-m1.md), owned by the contracts agent and the integrator.
- Context. The plan cites `docs/Spieldesign.md`, `docs/Regelkern.md`, `docs/Agentenvertrag.md`, `docs/Harness.md`, `docs/Entscheidungen.md` and `docs/spieltests/2026-10-03-spielbrett.md`, which moved into this knowledge base. Lane D does not edit the plan.
- Next action. Replace the paths by [game-design.md](game-design.md), [rules-kernel.md](rules-kernel.md), [agents-harness.md](agents-harness.md), [decisions.md](decisions.md) (M1-1 to M1-6 are D16 to D21) and [playtests.md](playtests.md), following the mapping in [INDEX.md](INDEX.md).

### Documents to update after the M1 merges

- Received. 2026-10-03
- Source. Lane D brief, the knowledge base describes `main` at `4f7ed7e` plus the M1 plan.
- Target. Every document of this folder, in particular [rules-kernel.md](rules-kernel.md), [data-contracts.md](data-contracts.md), [frontend.md](frontend.md), [agents-harness.md](agents-harness.md), [operations.md](operations.md), [testing.md](testing.md) and [playtests.md](playtests.md).
- Context. The lanes of M1 change the kernel (paths, issue params, view additions, settings), the server (`server/`, new game endpoints), the board (shell, i18n, audio, wheel, module views), the harness and remove the legacy code and the remaining `docs/` files.
- Next action. The final docs agent reconciles each document with the merged code and moves the states of the playtest table.
