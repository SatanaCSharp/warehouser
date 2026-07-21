---
name: design-ui
description: Create or refine feature UI designs with the local pen.dev/Pencil MCP server, review them live in the desktop canvas, record explicit human approval, and hand the approved design to implementation. Use for "design UI", "mock up this feature", "create UI alternatives", "preview this module", "design a feature", "/sdd:design-ui", or when planning a feature whose target surfaces include web, mobile, or desktop UI. Writes .pen sources, preview images, and design-handoff.md; never writes production UI code before approval.
---

# Design UI

Turn an approved feature specification into an editable pen.dev design and a precise implementation handoff. Keep the `.pen` file as the visual source of truth; do not use generated HTML as an intermediate source of truth.

## Inputs

- `<slug>` and `docs/features/<slug>/spec.md` (required).
- `docs/system/architecture-map.md`, the closest existing UI modules, application UI instructions, token sources, and component-library configuration (read when present).
- Existing `docs/features/<slug>/design.pen`, or `docs/mockups/app.pen` as the shared exploration/library file.
- Read [`references/pencil-workflow.md`](references/pencil-workflow.md) before using Pencil tools.

## Protocol

1. **Classify the work.** Confirm the feature has a UI surface. For backend-only work, return `N/A — no UI surface` and do not create artifacts.
2. **Load reality.** Read the spec, frontend architecture, existing tokens/components, and the closest UI precedent. Record which primitives must be reused. Never invent a second component or styling system.
3. **Connect to Pencil.** Prefer the `pencil` MCP server and an open Pencil desktop app. Inspect editor state before editing. If the desktop bridge is unavailable and the user accepts loss of live review, use the official `@pen.dev/cli` headless workflow described in the root README. If neither route is available, stop with setup instructions. Never substitute HTML generation.
4. **Choose the design file.** Prefer `docs/features/<slug>/design.pen` for feature-owned work. Use `docs/mockups/app.pen` only for shared explorations or design-system modules. Preserve previously approved frames; create a new named version instead of overwriting one.
5. **Design alternatives.** Create 2–3 meaningfully different alternatives unless the user asked for a direct revision. Include required states and at least the desktop and mobile viewports relevant to the spec. Reuse design variables/components matching the codebase.
6. **Verify.** Inspect layout structure, overlaps, clipping, hierarchy, variables, and component reuse. Capture screenshots into `docs/features/<slug>/previews/`. Follow [`references/design-review-checklist.md`](references/design-review-checklist.md).
7. **Approval gate.** Present the alternatives and trade-offs, then stop. Do not write application code and do not mark a design approved without explicit user approval naming the selected frame/version.
8. **Freeze the decision.** After approval, preserve the approved frame and create `docs/features/<slug>/design-handoff.md` from [`templates/design-handoff.md`](templates/design-handoff.md). Record the `.pen` path, exact frame name and node ID, viewports, states, component mapping, tokens, accessibility behavior, and unresolved questions.
9. **Hand off.** Recommend `/sdd:tasks <slug>` when architecture artifacts already exist; otherwise recommend the repository's architecture-design stage first. Implementation must read the approved handoff and report any visible deviation.

## Hard rules

- Keep design and implementation as separate approval phases.
- Treat `.pen` + the approved node ID as canonical; previews are review evidence.
- Do not export standalone HTML into `docs/mockups` as implementation input.
- A headless run must still export image/PDF review evidence and preserve the same explicit approval gate.
- Do not edit production code during this skill.
- Do not overwrite an approved frame; version it.
- Do not claim visual verification without screenshots and a layout inspection.
- Never store API keys or Pencil session tokens in the repository.

## Definition of Done

- A feature `.pen` file or explicitly identified shared mockup contains the alternatives.
- Desktop/mobile and required interaction states are present.
- Layout inspection and preview screenshots are complete.
- The user explicitly approved one named frame/version.
- `design-handoff.md` identifies that frame by name and node ID and maps it to existing UI primitives.
