---
id: T10
title: 'Fix kebab-trigger focus return and dismissal coverage (review findings #1, #2, #5)'
layer: 'ui'
deps: []
acs: ['CR-AC-03', 'CR-AC-04', 'CR-RG-02']
source_refs: ['../_review/review-2026-08-07.md#Stage-1']
files_hint:
  [
    'apps/web/src/modules/access/components/access-administration/MemberList.tsx',
    'apps/web/src/modules/access/components/access-administration/MemberList.spec.tsx',
    'apps/web/src/modules/access/components/access-administration/AccessAdministration.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T10 — Fix kebab-trigger focus return and dismissal coverage

## Why

[Review findings #1, #2, #5](../_review/review-2026-08-07.md) found: (1) an
`AccessAdministration.spec.tsx` assertion that queries button names that no longer exist in the DOM
(so it can never fail — the CR-AC-04/CR-RG-02 gating it claims to cover is unverified); (2) no
wiring or test confirms focus returns to the kebab trigger once a dialog opened from the menu is
dismissed (flagged as an unverified HeroUI-behavior risk in `sad.md` §11); (3) Enter/Space
activation of a focused trigger — one of two documented open paths — is untested.

## What

- In `AccessAdministration.spec.tsx`, change the permission-gating assertion (currently checking
  the absence of `"Edit email for …"`/etc. button names) to assert against the actual DOM: either
  the kebab trigger itself is absent (when no capability is true) or the opened menu omits the
  ungranted item.
- Verify (write a test first) that dismissing a dialog opened from the kebab menu (Cancel on
  EditEmailDialog/ResetPasswordDialog/DeleteMemberDialog) returns focus to the row's kebab trigger.
  If the current wiring doesn't already satisfy this, add the minimal fix.
- Add a test confirming Enter and Space on a focused kebab trigger open its menu.

## Definition of Done

- [ ] `AccessAdministration.spec.tsx`'s permission-gating test asserts real DOM state, not
      absence of retired button names
- [ ] A test confirms focus returns to the kebab trigger after a dialog opened from its menu is
      dismissed
- [ ] A test confirms Enter/Space open the kebab menu
- [ ] lint + vet clean
