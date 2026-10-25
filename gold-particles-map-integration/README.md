# Gold particles overlay for the existing map page

This is an isolated, CSS-only decorative effect intended to be enabled only on the map page.

## Files

```text
src/
└── effects/
    ├── gold-particle-rain.css
    └── gold-particle-rain.ts
```

## Integrate

1. Copy the `src/effects/` folder into the repository's existing `src/` directory.
2. Open the existing `src/main.ts`.
3. Add this import alongside the other imports:

   ```ts
   import './effects/gold-particle-rain.ts';
   ```

4. Run `pnpm dev` and inspect the map page. If the overlay is too prominent, lower the two `opacity` values in the CSS.

## Notes

- This does not replace or edit `src/style.css`, `src/main.ts`, or any existing map files. The only required code change is the single import line.
- `pointer-events: none` keeps map dragging, zooming, and node clicks available.
- All CSS selectors and animation names are prefixed with `gold-rain-` / `gold-rain-overlay` to avoid collisions.
- No image assets, canvas, external dependencies, or AI-generated images.
- This adds a visual overlay only; it does not implement real 3D coin meshes.
