# HTML previews

Review evidence for a design lives in `<work_item_root>/previews/` — `docs/features/<slug>/previews/`
for a feature, `docs/change-requests/<slug>/previews/` for a change request.

## The rule

**`previews/` holds `.html` files and nothing else.** Screenshots and exported images are
prohibited there: no `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`, `.gif`, `.svg`, `.pdf`, and no
`<img>`, `background-image`, or data-URI raster embedded inside a preview page. A preview is
markup, so a reviewer can resize it, inspect it, toggle its theme, and diff it in a pull request —
none of which a flat image allows.

Pencil canvas screenshots stay useful while designing: use them to verify your own layout inside
the conversation, then discard them. Never save one into the repository.

## One file per frame

Each approved Pencil frame gets exactly one preview file, named after the frame, kebab-cased,
without the `<Feature> /` prefix duplicated into the path:

```text
docs/features/auth/previews/
  sign-in-desktop-v1.html
  sign-in-mobile-v1.html
  sign-up-desktop-v1.html
  sign-up-mobile-v1.html
```

`design-handoff.md` pins each approved frame name + node ID to its preview file, so the mapping must
stay one-to-one. A new design revision adds `…-v2.html` beside the approved file; it never
overwrites it.

## What a preview file contains

Start from [`../templates/preview.html`](../templates/preview.html). Every file is a standalone
page that renders by opening it directly:

1. A header comment recording the frame name, the `.pen` path, the node ID, the viewport, and the
   states shown.
2. `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>` — Tailwind v4
   compiles the utility classes in the browser. No build step, no bundler, no local CSS import.
3. A `<style type="text/tailwindcss">` block holding the HeroUI v3 semantic tokens and the
   `@theme inline` mapping. Copy those values from
   `apps/web/node_modules/@heroui/styles/dist/themes/default/variables.css` and
   `.../themes/shared/theme.css`; when a token is missing, copy the missing declaration rather than
   inventing a colour. Hand-picked hex/rgb values are the drift that
   `apps/web/src/styles/global.css` warns about.
4. The screen itself, composed only of Tailwind utilities over those tokens — `bg-surface`,
   `text-muted`, `border-border`, `bg-accent text-accent-foreground`, `rounded-field`,
   `shadow-surface`. No second styling system, no inline `style="color:#…"`.

Set the frame width explicitly (`w-[1440px]`, `w-[390px]`) to match the viewport in the header
comment, and toggle dark mode with `data-theme="dark"` on `<html>` rather than by hand-picking dark
colours.

Icons that the design system draws come from the repository's icon library; inline the SVG symbol
markup for them. That is component markup, not preview imagery, and it is the one place vector
`<svg>` is allowed inside a preview.

## Boundaries

- The `.pen` frame plus its node ID remains the visual source of truth. The preview renders it;
  it does not define it.
- Preview markup is not implementation input. Implementation reads `design-handoff.md` and the
  approved frame, and must never copy preview HTML into `apps/`.
- A headless `@pen.dev/cli` run publishes the same HTML previews. "The bridge was unavailable" does
  not license an image export.

## Before requesting approval

- Open every preview file and confirm it renders — a missing CDN script or a malformed token block
  yields an unstyled page.
- `ls` the previews directory and confirm every entry ends in `.html`.
- Confirm each approved frame has exactly one preview file and that `design-handoff.md` names it.
