Before implementing changes in `apps/web`, read the relevant UI-related documentation under
`docs/system/`, including the frontend architecture documentation.

Keep feature-owned Redux state with its feature under `src/modules/<module>/store/`. The root
`src/store/` directory is only for application-wide store composition, typed hooks, and generic
middleware. In a feature store, declare case reducers in `<module>.actions.ts`, create the slice
and export its generated actions and reducer from `<module>.slice.ts`, and keep typed reads in
`<module>.selectors.ts`. Do not add a reducer re-export file. Follow
`../../docs/system/guides/adding-a-web-module.md` when adding or moving state.

For API errors, form errors, notifications, success feedback, and their translations, follow
`../../docs/system/guides/web-error-handling.md`.
