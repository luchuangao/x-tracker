# X-Tracker logo

The approved mark uses a white X on a rounded tile with a mist-blue to deep-indigo gradient. PNGs preserve transparency outside the tile. The 16, 32, 48, 128, and 512 pixel files are exported from one image.

Created with the built-in Image Gen tool. The approved color-refinement prompt kept the existing X geometry, crossing gap, corner radius and layout, changed the tile to a subtle diagonal gradient (#596FAD → #3D528B → #283A69), and changed the presentation wordmark to midnight navy (#253655).

Final asset prompt:

> Extract only the approved rounded-square blue icon containing the white X. Remove the wordmark and surrounding white presentation background. Preserve the X geometry, crossing gap, corner radius and blue gradient. Center the isolated icon on a transparent square canvas with minimal equal padding. Keep the X and blue tile opaque. No text, extra symbols, shadows or redesign.

The image was cropped to a centered 1088 × 1088 square before exporting the size variants with macOS `sips`. This normalizes the transparent margin without changing the mark.

Runtime appearance settings recolor this approved bitmap with Canvas, retaining its silhouette and alpha channel. Light tile colors use a dark X for contrast. The toolbar icon is restored from local settings when the service worker or browser starts; static manifest icons remain the default blue mark.
