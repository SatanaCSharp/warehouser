---
name: design-ui
description: Create or refine one cohesive feature UI design with the local pen.dev/Pencil MCP server, review it live in the desktop canvas, record explicit human approval, and hand the approved design to implementation. Use for "design UI", "mock up this feature", "preview this module", "design a feature", "/design-ui", or when planning a feature whose target surfaces include web, mobile, or desktop UI. Writes .pen sources, preview images, and design-handoff.md; never writes production UI code before approval.
---

# Design UI

Turn an approved feature specification into an editable pen.dev design and a precise implementation handoff. Keep the `.pen` file as the visual source of truth; do not use generated HTML as an intermediate source of truth.

## Inputs

- `<slug>` and `docs/features/<slug>/spec.md` (required).
- `docs/system/architecture-map.md`, the closest existing UI modules, application UI instructions, token sources, and component-library configuration (read when present).
- Existing `docs/features/<slug>/design.pen`, or `docs/mockups/app.pen` as the shared exploration/library file.
- Read [`references/pencil-workflow.md`](references/pencil-workflow.md) before using Pencil tools.

## Design-system and UX standards

- Follow established UI/UX best practices: give each screen one clear purpose and primary action, preserve visual hierarchy, minimize cognitive load, disclose complexity progressively, keep system status visible, and make feedback and recovery paths clear.
- Compose every screen from the repository's HeroUI design system. Reuse HeroUI components, semantic tokens, typography, spacing, radii, elevation, interaction states, and accessibility behavior represented in the existing code and Pencil library. Do not create detached lookalikes or a parallel visual language.
- Keep the complete feature flow in one coherent style. Related screens—such as sign-in and sign-up, list and detail, or create and edit—must share the same application shell, component treatments, token usage, density, layout logic, and responsive strategy.
- Related screens may have different content and task-specific controls, but they must not look like unrelated products or switch between incompatible layout concepts. Derive each related screen from the same approved visual foundation.
- Generate one design direction only. Resolve information architecture, emphasis, and interaction decisions into one coherent HeroUI flow instead of producing alternatives for the user to compare.
- Treat desktop and mobile as responsive views of the same design. Preserve information hierarchy, action priority, component identity, and interaction behavior across viewports instead of redesigning the experience at each breakpoint.

## Protocol

1. **Classify the work.** Confirm the feature has a UI surface. For backend-only work, return `N/A — no UI surface` and do not create artifacts.
2. **Load reality.** Read the spec, frontend architecture, existing tokens/components, the HeroUI configuration/library, and the closest related UI flows. Record which HeroUI primitives, tokens, shell patterns, and responsive rules must be reused. Never invent a second component or styling system.
3. **Connect to Pencil.** Prefer the `pencil` MCP server and an open Pencil desktop app. Inspect editor state before editing. If the desktop bridge is unavailable and the user accepts loss of live review, use the official `@pen.dev/cli` headless workflow described in the root README. If neither route is available, stop with setup instructions. Never substitute HTML generation.
4. **Choose the design file.** Prefer `docs/features/<slug>/design.pen` for feature-owned work. Use `docs/mockups/app.pen` only for shared explorations or design-system modules. Preserve previously approved frames; create a new named version instead of overwriting one.
5. **Design one complete flow.** Create exactly one design direction. Cover all related screens in one consistent HeroUI style, include required states, and include at least the relevant desktop and mobile viewports. Reuse the same design variables, components, shell, density, and responsive logic across the flow. Do not generate optional variants or alternative visual concepts.
6. **Verify the system and the flow.** Inspect layout structure, overlaps, clipping, hierarchy, variables, component reuse, HeroUI fidelity, cross-screen consistency, and responsive continuity. Compare related screens side by side so changes in task do not accidentally change the visual system. Capture screenshots into `docs/features/<slug>/previews/`. Follow [`references/design-review-checklist.md`](references/design-review-checklist.md).
7. **Approval gate.** Present the single design flow, explain its key decisions and trade-offs, then stop. Do not write application code and do not mark a design approved without explicit user approval naming the reviewed frame/version.
8. **Freeze the decision.** After approval, preserve the approved frame and create `docs/features/<slug>/design-handoff.md` from [`templates/design-handoff.md`](templates/design-handoff.md). Record the `.pen` path, exact frame name and node ID, viewports, states, component mapping, tokens, accessibility behavior, and unresolved questions.
9. **Hand off.** Recommend `/tasks <slug>` when architecture artifacts already exist; otherwise recommend the repository's architecture-design stage first. Implementation must read the approved handoff and report any visible deviation.

## Hard rules

- Keep design and implementation as separate approval phases.
- Treat `.pen` + the approved node ID as canonical; previews are review evidence.
- Do not export standalone HTML into `docs/mockups` as implementation input.
- A headless run must still export image/PDF review evidence and preserve the same explicit approval gate.
- Do not edit production code during this skill.
- Do not overwrite an approved frame; version it.
- Do not claim visual verification without screenshots and a layout inspection.
- Generate exactly one design direction; do not create alternative variants for comparison.
- Use HeroUI as the visual and interaction foundation for every generated screen.
- Do not mix visual styles, component treatments, layout systems, or responsive strategies within one feature flow.
- Do not design related screens as unrelated one-off compositions; reuse the same shell and design-system decisions.
- Never store API keys or Pencil session tokens in the repository.

## Definition of Done

- A feature `.pen` file or explicitly identified shared mockup contains one complete design direction.
- Desktop/mobile and required interaction states are present.
- All related screens use one coherent HeroUI visual system and responsive strategy.
- Component, token, shell, and interaction reuse is documented and visually verified across the complete flow.
- Layout inspection and preview screenshots are complete.
- The user explicitly approved one named frame/version.
- `design-handoff.md` identifies that frame by name and node ID and maps it to existing UI primitives.
