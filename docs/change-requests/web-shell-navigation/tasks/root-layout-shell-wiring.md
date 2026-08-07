---
id: T6
title: "Wire RootLayout's authenticated branch to the new shell"
layer: 'ui'
deps: ['T3', 'T4', 'T5']
acs: ['CR-AC-01', 'CR-RG-03', 'CR-RG-04']
source_refs: ['change.md#CH-01']
files_hint: ['apps/web/src/shared/layouts/RootLayout.tsx']
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T6 — Wire RootLayout's authenticated branch to the new shell

## Why

[spec §CR-AC-01](../spec.md) and [sad §6.1](../sad.md) require the new chrome to reach only the
`isAuthRoute === false && isAuthenticated === true` branch, leaving the auth-route and chrome-less
branches exactly as today (CR-RG-03, CR-RG-04).

## What

In `RootLayout.tsx`'s authenticated branch only, compose the header (existing brand + sign-out,
plus the new `LanguageSelector` and — below `sm` — a drawer-toggle button wired to `Sidebar`'s
drawer), `Sidebar`, `Footer`, and `Outlet`, in that order. Remove the inline "Access" link the
header renders today (superseded by `Sidebar`). Leave the auth-route branch and the `null`
chrome-less branch byte-for-byte unchanged.

## Definition of Done

- [ ] Shell integration tests assert the auth-route branch renders exactly as before (CR-RG-03)
- [ ] Shell integration tests assert the chrome-less branch renders exactly as before (CR-RG-04)
- [ ] Shell integration tests assert the authenticated branch renders header + Sidebar + Footer + Outlet, with no inline "Access" link, at both `<sm` and `>=sm`
- [ ] lint + vet clean

## Notes

This is the integration point for T3/T4/T5 — do not duplicate `Sidebar`'s gating predicate here;
`RootLayout` only decides which branch renders and passes existing data through.
