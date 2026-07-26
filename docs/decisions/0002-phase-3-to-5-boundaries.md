# Phase 3–5 implementation boundaries

## Decision

Turn work is split into deterministic country workspaces, queued AI proposals, administrator review, and an idempotent publish step. AI output can propose only allowlisted effects; it cannot update country snapshots directly. Publication records applied-effect source keys and creates the public economic and political snapshots once.

Events and opposition actions require administrator review. Human-required event choices block publication, while AI-country events receive the first valid option during publication. Diplomatic AI responses remain drafts until approved.

The world map uses H3 resolution 4 (288,122 cells), PostGIS geometry and vector tiles. The administrator sees a globe and a Mercator editor together. Manual edits and image imports use campaign map revisions, append-only change sets, and audit logs. Image import maps country palette colors by cell centroid and ignores black or transparent border pixels.

## Consequences

- Re-running a turn or map request does not duplicate effects or silently overwrite a newer map revision.
- Generated proposals remain reviewable records rather than trusted database commands.
- Map rendering loads tile-sized subsets instead of serializing the complete globe to the browser.
- The image importer expects an equirectangular world image and leaves unmatched colors unchanged.
