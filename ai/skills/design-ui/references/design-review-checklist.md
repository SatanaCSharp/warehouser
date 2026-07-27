# Design review checklist

Before requesting approval, verify:

- Every spec user flow exposed through UI has an entry, success, empty, loading, error, disabled, and authorization state where applicable.
- Desktop and mobile frames use explicit viewports and describe intermediate responsive behavior.
- No overlap, clipping, unintended overflow, off-canvas content, or ambiguous stacking appears in layout inspection.
- Repeated UI uses Pencil components and codebase equivalents are named.
- Every screen is composed from the repository's HeroUI primitives and semantic tokens; no detached lookalikes or parallel styling system appears.
- Related screens share the same shell, component treatments, typography, spacing, radii, elevation, density, and layout logic.
- Related workflows are reviewed side by side and look like parts of one product, even when their content and primary tasks differ.
- Desktop and mobile preserve the same information hierarchy, action priority, component identity, and interaction behavior.
- The artifact contains one resolved design direction only; no unrequested alternative variants or competing concepts remain.
- Color, typography, spacing, radii, and elevation use existing variables/tokens where available.
- Keyboard order, focus visibility, labels, error association, contrast intent, and reduced-motion behavior are described.
- Icons map to the repository's icon library.
- Screenshots exist for every candidate presented for approval.
- Trade-offs describe behavior and information hierarchy, not just aesthetics.
- The approval request names exact frame versions; approval is never inferred from general positive feedback.
