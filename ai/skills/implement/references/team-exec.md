# Agent-team execution (`team_mode: true`)

When the decision tree selects the team, the engine becomes a **lead** coordinating three roles through a shared task list, one git worktree per agent, with commits serialized by the lead. Use this for features with genuine parallel width and a desire for an independent review pass.

## Roles (the shipped subagents)

Spawn each by its plugin-namespaced worker role — `test-author`, `implementer`, `reviewer` (see [`../../_shared/agent-roster.md`](../../_shared/agent-roster.md) §Dispatching).

- **[`test-author`](../../../agents/test-author.md)** (`test-author`) — RED only. Writes the failing test(s) for a task's `acs`, runs them, classifies the first run (GOOD/BAD/false-pass/NON-red per [`tdd-loop.md`](./tdd-loop.md)), and hands over the quoted failing line. Never writes production code.
- **[`implementer`](../../../agents/implementer.md)** — GREEN + REFACTOR + GATE. Takes a task with its red test, writes the minimal code to pass, refactors while green, runs the per-task gate. Never weakens the test.
- **[`reviewer`](../../../agents/reviewer.md)** — read-only. Three stages: spec/AC compliance, quality, and explicit conformance to the task's system-document manifest. Has no write tools.

## Setup

1. Create the team (`the runtime worker-delegation mechanism`). Seed a shared **TaskList** from `tasks.json` — **the full task text goes in each task body** (title, `acs` text pulled from spec §5, `dod`, `files_hint`) together with the task's **system-document manifest** (exact applicable architecture, guide, and Accepted system-ADR paths). Teammates do NOT read the plan or the conversation; the task body is their whole brief. Each teammate must still open and read every manifest file directly before acting.
2. Give each agent its own git **worktree** under `.worktrees/<agent>` (`isolation: worktree` is required for the team — the guard enforces it). No two agents share a tree.
3. Set per-role **model + effort** from `model_*` / `effort_*` + the `.size` scaling, and export the env vars for the dispatch — all per [`../../_shared/agent-roster.md`](../../_shared/agent-roster.md) (roster defaults: test-author/implementer balanced-tier + medium effort, reviewer reasoning-tier + high effort). Print the resolved per-role model+effort in the banner.

## Flow per task

`test-author` (RED) → `implementer` (GREEN+REFACTOR+GATE) → `reviewer` (review). A task advances only when its `deps` are `done`. The lead pulls ready tasks off the DAG and assigns them; up to `max_parallel_agents` run at once.

Each role's handover must list the manifest paths it read. The reviewer must emit an explicit architecture-conformance verdict. The lead rejects and re-dispatches any handover missing that evidence; a task cannot become `done` merely because its tests pass.

## Serialization lanes (the lead enforces)

Even with worktrees, some tasks must not run concurrently:

- **`layer: migration`** — TypeORM migrations are an ordered timestamped sequence; run them one at a time. Each migration task promotes its staged class into the live server tree before applying and reverting it—see [`./inputs.md`](./inputs.md).
- **Overlapping `files_hint`** — two tasks that touch the same file run in the same lane (serialized), or the second rebases on the first. Compute lanes from `files_hint` intersections up front.
- **Compile-coupled pair** — a shared-contract change + its implementer(s) share the contract file in `files_hint`, so they land in one lane by the rule above; additionally the lead gives the pair a synthetic dep (contract → implementer) and closes it with **one shared gate + one commit** carrying every task's `SDD-Task`/`SDD-AC` trailers ([`tdd-loop.md`](./tdd-loop.md) §COMMIT) — neither task is separately committable green.

Tasks in different lanes with satisfied deps run in parallel; tasks in the same lane queue.

## Commits

The lead **serializes commits in dependency order** regardless of when the work finished — pull each agent's worktree changes for a `done` task and commit them on the feature branch with the `SDD-Task`/`SDD-AC` trailers ([`tdd-loop.md`](./tdd-loop.md)). The history is linear and bisectable even though the work was concurrent.

## Don't over-orchestrate

- **<4 tasks → no team.** The eligibility check already forbids it; if you somehow got here with a tiny DAG, downgrade to sequential. Coordination overhead exceeds the gain.
- A red that survives escalation in one lane follows `stop_on_red`: halt the whole team, or drop that task + auto-block its dependents and let other lanes finish ([`escalation.md`](./escalation.md)).
- Tear the team down at the end; remove worktrees (they auto-clean if unchanged).
