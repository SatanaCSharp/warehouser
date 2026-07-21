---
name: system-docs
description: >
  Create, update, organize, or review feature-agnostic technical documentation shared by the whole
  repository under docs/system. Use for system guidance and contributor guides, the system SAD,
  architecture maps, cross-cutting server or frontend architecture, repository-wide conventions,
  and system-level ADRs; also use when deciding whether technical documentation belongs in
  docs/system or docs/features. Route feature-specific requirements, designs, SADs, ADRs, APIs,
  data models, test plans, tasks, reviews, and implementation records to the existing feature skills
  and docs/features/{slug} instead of handling them here.
---

# System documentation

Maintain durable documentation about how the repository-wide system is structured and how
contributors extend it. Keep the skill agent-agnostic: rely on repository files and ordinary file
operations, not a named model, agent role, plugin, or vendor-specific tool.

## Classify the scope first

Choose the destination before drafting:

| Scope                                                                     | Destination             | Examples                                                                              |
| ------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| Shared system structure, policy, or reusable extension procedure          | `docs/system/`          | server architecture, frontend architecture, module boundaries, shared contracts guide |
| Cross-cutting architectural decision with consequences beyond one feature | `docs/system/adr/`      | validation strategy, monorepo boundaries, system-wide event policy                    |
| One feature's problem, behavior, design, or delivery history              | `docs/features/<slug>/` | spec, feature SAD, feature ADR, API, data model, test plan, tasks, review             |

Apply the blast-radius test: if removing one feature would make the document unnecessary, it is
feature documentation. If multiple current or future features must follow it, it is system
documentation. When a document mixes both scopes, keep the invariant or shared mechanism in
`docs/system` and link to the feature artifact for the concrete use case. Do not duplicate prose.

If scope remains genuinely ambiguous, state the proposed destination and the evidence, then ask
one focused question before writing.

## Respect existing ownership

- Use `survey` for a comprehensive first-time or stale-codebase scan. Treat its architecture-map
  output as the factual inventory; do not create a competing discovery workflow.
- Use this skill when the user explicitly asks to author, explain, reorganize, or maintain shared
  system documentation, including a focused architecture-map update backed by repository evidence.
- Leave all `docs/features/<slug>/` artifacts to the existing feature skills. In particular,
  `specify` owns feature requirements, feature design/SAD workflows own feature architecture,
  `decide-adr` owns feature ADRs, and the API/data-model/test/tasks/review skills own their named
  artifacts.
- Do not dispatch or redefine the roles in `ai/agents`. Read-only exploration may inform the
  documentation, but this skill owns the document and its accuracy.
- Follow repository-level instruction files and local conventions before this skill.

## Select the system artifact

- **Architecture map** — maintain `docs/system/architecture-map.md` as the concise, evidence-backed
  map of the system that exists: containers, packages/modules, dependencies, boundaries, runtime
  communication, datastores, and cited precedents. Describe current state separately from target
  state. Prefer `file:line` evidence and mark unknowns rather than guessing.
- **System SAD** — maintain `docs/system/sad.md` for the repository-wide architectural approach:
  context, quality goals, constraints, solution strategy, major building blocks, cross-cutting
  concepts, deployment/runtime view, risks, and links to system ADRs. Keep feature use cases out.
- **Focused architecture document** — add a clearly named document under `docs/system/` when one
  subsystem needs more detail than the map or SAD can carry, such as `server-architecture.md` or
  `frontend-architecture.md`. Link it from the map or SAD and avoid repeating their overview.
- **Guide** — add `docs/system/guides/<verb-or-task>.md` for repeatable, feature-agnostic procedures
  such as adding a server module, extending the frontend foundation, or adding shared contracts.
  Include prerequisites, ordered steps, repository-native examples, verification, and common
  failure modes.
- **System ADR** — add one decision per file under `docs/system/adr/`. Detect and follow the existing
  filename and heading convention. Record status, context, decision, alternatives when known, and
  positive and negative consequences. Link any guide that operationalizes the decision.

Prefer updating the closest existing document over creating a near-duplicate. Create a new file
only when it has a distinct audience, lifecycle, or level of detail.

## Workflow

1. Read the root project instructions, existing `docs/system` files, relevant system ADRs, and the
   closest implementation evidence. Read related feature artifacts only for context, never as a
   substitute for shared evidence.
2. Classify the request as system-wide or feature-specific. If feature-specific, stop and route it
   to the matching existing skill and `docs/features/<slug>`; do not write a system document.
3. Identify the canonical system artifact and check for overlapping content. Decide whether to
   update, split, link, or create.
4. Draft facts from code, configuration, manifests, and accepted ADRs. Separate observed current
   state, accepted decisions, and proposed target state. Never present a proposal as implemented.
5. Write concise Markdown using the repository's terminology and existing document style. Use
   relative links between documents and paths rooted at the repository for code references.
6. Reconcile dependent system documents: architecture changes may require updates to the map, SAD,
   an ADR index/link, and an implementation guide. Update only affected sections.
7. Verify every referenced path and link, check that the document does not contain feature-only
   acceptance criteria or delivery detail, and inspect the final diff for duplication or conflict.

## Content rules

- Describe stable boundaries, invariants, extension points, and rationale—not a snapshot of every
  class or component.
- Make guidance executable: state where a shared concern belongs, how to add it, which established
  pattern to copy, and how to verify the result.
- Cover server and frontend architecture independently when their boundaries or conventions differ;
  explain their integration points in the system map or SAD.
- Link decisions to guidance: ADRs explain why; guides explain how; the map explains where; the SAD
  explains how the whole architecture fits together.
- Cite concrete repository evidence for current-state claims. Use `UNKNOWN` or a clearly labelled
  open question when evidence is absent.
- Preserve authored content and unrelated user changes. Do not silently overwrite decisions or
  normalize another document into a new format.

## Definition of done

- Every created or updated file is under `docs/system/` and is feature-agnostic.
- The artifact has one clear purpose and does not duplicate another system or feature document.
- Current-state claims are supported by repository evidence; proposals are visibly labelled.
- Relevant system documents and ADRs link to each other with valid relative paths.
- Feature-specific material was left in, or routed to, `docs/features/<slug>` and its owning skill.
- The final diff contains no agent-, model-, plugin-, or vendor-specific operating instructions.

## Anti-patterns

- Putting a feature's SAD or ADR in `docs/system` because it mentions architecture.
- Rewriting feature artifacts through this skill instead of invoking their existing owner.
- Creating `frontend-architecture-v2.md` when an existing document can be updated.
- Copying a feature's implementation steps into a shared guide without extracting the reusable rule.
- Treating the architecture map as a target-state wish list or claiming undocumented code exists.
- Recording a system-wide decision only inside a guide; decisions belong in an ADR and guides link
  to them.
