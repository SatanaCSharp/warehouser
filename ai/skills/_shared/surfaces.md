# Target surfaces

Feature SAD frontmatter declares `target_surfaces` using: `web-frontend`, `mobile-app`,
`desktop-app`, `backend-service`, `worker`, `cli`, or `library-sdk`.

Use `docs/system/architecture-map.md` and the feature specification to select only surfaces the
feature changes. UI surfaces require the `design-ui` approval gate. `backend-service` normally
produces an HTTP contract when the system map identifies REST; `worker` produces job/event
contracts; `cli` and `library-sdk` use their native public interface. Missing surfaces are a design
gap: warn and use `backend-service` only when the existing system architecture makes that fallback
unambiguous.
