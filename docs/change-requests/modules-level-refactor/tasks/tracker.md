# Tracker — change-request: modules-level-refactor

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.
> Sizing: **S** ≤ half a day · **M** ~ three quarters of a day · **L** ~ one full day. Nothing exceeds
> one working day — a task that grows past it is split, not re-estimated.

| #   | Task                                                         | Layer  | Owner  | Estimate | Blocked by | Status |
| --- | ------------------------------------------------------------ | ------ | ------ | -------- | ---------- | ------ |
| T1  | Pin `baseline_revision` on a clean tree                      | docs   | YuriiH | S        | —          | done   |
| T2  | Commit the three identity baselines and their gates          | tests  | YuriiH | L        | T1         | done   |
| T3  | Add the system ADR and both index entries                    | docs   | YuriiH | M        | —          | done   |
| T4  | State the ownership rule in the three module guides          | docs   | YuriiH | L        | T3         | done   |
| T5  | Promote the three cross-destination error members            | domain | YuriiH | M        | T1, T4     | done   |
| T6  | Create the `warehouses` module                               | app    | YuriiH | L        | T2, T5     | done   |
| T7  | Split `warehouse.controller.ts` across two modules           | ports  | YuriiH | L        | T6         | done   |
| T8  | Move the fourteen access factories, delete the old directory | domain | YuriiH | M        | T7         | done   |
| T9  | Move the seven workspace role/member/owner commands          | app    | YuriiH | L        | T8         | done   |
| T10 | Move the four list queries, predicates and deletion service  | app    | YuriiH | M        | T8         | done   |
| T11 | Move the eleven handlers onto `WorkspaceAccessController`    | ports  | YuriiH | L        | T9, T10    | todo   |
| T12 | Trim `workspaces` and prove the graph acyclic                | wiring | YuriiH | M        | T11        | todo   |
| T13 | Add the two server boundary specs, tighten `users`           | tests  | YuriiH | M        | T12        | todo   |
| T14 | Promote the six multi-consumer web files                     | ui     | YuriiH | L        | T2, T4     | done   |
| T15 | Move the Warehouse domain into `modules/warehouse`           | ui     | YuriiH | L        | T14        | done   |
| T16 | Move the workspace scope of Access into `modules/access`     | ui     | YuriiH | L        | T14        | done   |
| T17 | Compose the shell across modules                             | ui     | YuriiH | M        | T15, T16   | done   |
| T18 | Register the `warehouse` namespace, re-home the copy         | ui     | YuriiH | M        | T17        | done   |
| T19 | Declare each web module's surface and enforce it             | tests  | YuriiH | L        | T18        | done   |
| T20 | Run the pre-merge verification                               | tests  | YuriiH | M        | T13, T19   | todo   |

**Total:** 20 tasks, ~16 person-days.

**Lanes.** `implement` serializes tasks with overlapping `files_hint`. Three lanes matter here:

- **Compile-coupled lane T7 · T8 · T9 · T10** — all carry
  `apps/server/src/access/domain/errors/workspace-access.errors.ts`. The fourteen factories cannot be
  committed green apart from their consumers: leaving a consumer in `workspaces` makes it deep-import
  `access/domain/errors` (CR-AC-08), and moving a consumer first makes `access` import `workspaces`,
  which `tests/access/authorization-coverage.spec.mjs:161` already fails on. They close with one
  shared gate and one commit carrying every task's `SDD-Task` trailers.

  > **Amended during implementation.** The lane was planned as T8 · T9 · T10 with T7 upstream, but
  > that edge is inverted: `assign-warehouse-membership.command.ts` and
  > `revoke-warehouse-membership.command.ts` — which **T7** moves into `access` — import both
  > `workspaces/domain/errors/workspace.errors` and
  > `workspaces/domain/predicates/workspace-authority.predicates`, so T7 is the _first consumer_ of
  > what T8 and T10 move. It was folded into the lane by explicit decision and landed as one commit
  > carrying all four `SDD-Task` trailers — find it by `git log --grep 'SDD-Task: T8'`.

- **Server ports lane T7 · T11 · T13** — all touch `tests/access/authorization-coverage.spec.mjs`,
  whose exemption keys are path-valued and must be re-pathed in the same commit that moves the handler.
- **Web workspace lane T14 · T15 · T16 · T17** — all remove files from
  `apps/web/src/modules/workspace/`, so they run one at a time even where the DAG allows T15 and T16 to
  start together.
