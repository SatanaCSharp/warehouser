# Design review checklist

Before requesting approval, verify:

- Every spec user flow exposed through UI has an entry, success, empty, loading, error, disabled, and authorization state where applicable.
- Desktop and mobile frames use explicit viewports and describe intermediate responsive behavior.
- No overlap, clipping, unintended overflow, off-canvas content, or ambiguous stacking appears in layout inspection.
- Repeated UI uses Pencil components and codebase equivalents are named.
- Color, typography, spacing, radii, and elevation use existing variables/tokens where available.
- Keyboard order, focus visibility, labels, error association, contrast intent, and reduced-motion behavior are described.
- Icons map to the repository's icon library.
- Screenshots exist for every candidate presented for approval.
- Trade-offs describe behavior and information hierarchy, not just aesthetics.
- The approval request names exact frame versions; approval is never inferred from general positive feedback.
