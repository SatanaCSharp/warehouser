---
id: T35
title: 'Add the modules/workspace route, page shell, tabs and i18n namespace'
layer: 'ui'
deps: ['T32', 'T33']
acs: ['AC-29', 'AC-30']
files_hint:
  [
    'apps/web/src/modules/workspace/route.tsx',
    'apps/web/src/modules/workspace/page.tsx',
    'apps/web/src/modules/workspace/components/WorkspaceAdministration.tsx',
    'apps/web/src/shared/layouts/Sidebar.tsx',
    'apps/web/src/shared/constants/routes.ts',
    'apps/web/public/locales/en/workspace.json',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T35 — Add the modules/workspace route, page shell, tabs and i18n namespace

## Why

The container the three tab tasks fill, and the place AC-30's hardest requirement lives: a navigation
entry or destination whose every capability is unavailable is **omitted**, not disabled and not shown
empty ([design-handoff.md §States and interactions](../design-handoff.md#states-and-interactions),
state `b7j4A`).

## What

- `modules/workspace/route.tsx` and `page.tsx` owning `ROUTES.WORKSPACE`, coordinating loading,
  partial read authority, workflows, confirmation, errors and navigation. The route guard redirects
  when no Workspace capability opens the destination.
- `components/WorkspaceAdministration.tsx` — the approved shell: page heading and its primary action
  sharing one row, segmented tabs at both viewports in the order Warehouses / Workspace roles /
  Members / Permissions, with the mobile label shortening ("Workspace roles" → "Roles"); order and
  count never change.
- The name-the-Workspace dialog and the unnamed-Workspace placeholder (`$warning/soft` treatment),
  wired to the rename endpoint (AC-29).
- The Sidebar Workspace entry beside Access, gated by the **Workspace-level** gate from
  [T33](./workspace-context-api-and-gate.md) — never `PermissionGate`.
- The workspace path in `shared/constants/routes.ts`.
- `public/locales/{en,uk}/workspace.json` — created here with the full key skeleton drawn from the
  approved copy, including keys the tab tasks will use.

## Definition of Done

- [ ] Tests prove the Sidebar entry and the destination are **absent** when the actor holds no
      Workspace capability, and that a direct navigation is redirected (AC-30).
- [ ] Tests prove each tab is present only under its own watch Permission —
      `WAREHOUSES:WATCH`, `WORKSPACE_ROLES:WATCH`, `WORKSPACE_MEMBERS:WATCH` — and that no dataset is
      requested for a tab the actor may not read.
- [ ] Tests cover naming an unnamed Workspace: the placeholder is replaced, an invalid name binds its
      error to the field naming the rule, and the existing state survives a failure (AC-29).
- [ ] Responsive tests at 1440 (80px header, 240px sidebar, 40px-padded main) and 390 (68px header,
      stacked full-width actions) match the approved frames.
- [ ] Accessibility: semantic headings, navigation landmark, `tabs`/`tabpanel` semantics, keyboard
      order header → switcher → sidebar → heading → action → tabs → list → detail.
- [ ] `workspace.json` exists for `en` and `uk` with matching key sets.
- [ ] lint + build + web suite green.

## Notes

Route visibility is advisory UI behaviour and never the authorization boundary
([design-handoff.md §Implementation constraints](../design-handoff.md#implementation-constraints)).
This task heads the `workspace.json` lane — [T36](./warehouses-tab.md), [T37](./warehouse-access-grant-withdraw.md),
[T38](./workspace-roles-tab.md) and [T39](./workspace-members-tab.md) add their own keys to the same
file, so `implement` serializes them behind this one. The pre-existing
`modules/access/components/access-workspace/` is presentation vocabulary with no domain meaning —
read the path, not the word ([sad §8 Naming](../sad.md#naming)).
