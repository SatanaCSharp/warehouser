# Feature size and routes

| Size | Typical scope                                    | Task count | Route      |
| ---- | ------------------------------------------------ | ---------: | ---------- |
| S    | one module, no architectural decision            |        3–8 | `quick`    |
| M    | several layers or one integration                |       8–14 | `standard` |
| L/XL | multiple modules, surfaces, or operational risks |      12–20 | `full`     |

All routes start with `specify`. `quick` may skip clarify, data-model, API, or plan-tests only when
the owning skill's N/A condition is proven. `standard` offers those skips for confirmation. `full`
runs every applicable stage. Every route runs `design` before `tasks`; UI routes additionally run
`design-ui` and require approval. ADRs are created only for decisions that pass the design
blast-radius gate—an ADR is never required merely to unlock tasks.
