# Phase 0–2 implementation boundaries

## Decision

The repository implements the guide through Phase 2 as a single Next.js application with a separate, currently idle worker process and PostgreSQL/PostGIS. Player and administrator writes go through server actions, domain validation, and the repository layer.

Approved administrator metric changes are append-only `admin_change_proposals`. The original country-turn snapshot remains immutable. Player reads overlay approved proposals in creation order, preserving both the original value and every review decision in the audit log.

## Consequences

- Phase 3 can consume the same immutable snapshots and create the next turn without retroactively rewriting history.
- The Phase 2 user interface can safely demonstrate before/after review without exposing turn publication controls early.
- Research allocations are accepted only during `DRAFT`; the worker does not apply them until Phase 3.
- Event, submission, diplomacy, map, and chat navigation is not shown because those vertical slices begin in later phases.
