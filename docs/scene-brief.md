# Scene brief — ring atlas

- **Composition reference:** `public/assets/fantasy-world-map.jpg` defines the original coastline, region divisions, spacing, and node coordinate system in x=0..8192. An explicitly authored 1024-unit strip extends the cut coasts without changing that original area.
- **Palette reference:** the same supplied atlas defines the mint, blue-green, pale cyan, white ocean, and dark teal linework. Light mode must reproduce these colors without lighting gradients; dark mode may lower luminance but must preserve hue relationships.
- **Dominant silhouettes:** the long western continent group, the central island/continent cluster, and the separated eastern land group. Their proportions and negative ocean corridors must remain unchanged.
- **Camera:** perspective camera placed at the center of a cylindrical map. The cylinder provides the spatial effect; the map artwork itself remains a flat, undistorted color surface on that cylinder.
- **Layer order:** solid ocean cylinder, independent vector region faces with sampled original fill colors, shared vector strokes, subtle grid, then HTML nodes and dossier UI.
- **Inferred geometry:** region outlines and enclosed pale features traced from the supplied JPEG, simplified/smoothed as a shared planar coverage, then triangulated and bent onto the cylinder. This is an approximation, not recovered original vector data. Region relief is excluded; height extraction would damage the supplied boundaries.
- **Interactions:** horizontal drag/wheel rotation, pinch or modified-wheel zoom, node focus, reset, theme switching, and the manual node-coordinate editor.

## Rendering constraint

Color boundaries take precedence over terrain relief. Never derive displacement, opacity, or bump data from the atlas colors. Any future true relief must use separately authored vector paths or a dedicated clean mask.

## Verification and limitations

The generator checks coverage and the standalone validator checks exported triangles. `vector-review.html` offers a source/vector comparison without atmospheric effects. Very small islands, thin areas and weak borders need manual geographic review. The 9216-unit-wide master has matching periodic edge profiles. The new coastlines are assistant-authored vector artwork, not recovered or canonical source geography; see `seam-extension.md`.
