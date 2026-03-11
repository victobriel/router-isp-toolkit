# Router drivers

Infrastructure adapters that implement the domain `IRouter` port. Each vendor/model has its own folder; shared types and parsers live in `shared/`.

## Layout

- **`shared/`** — Used by multiple drivers
  - `types.ts` — `TopologyBand`, `TopologyClient`
  - `TopologySectionParser.ts` — `ITopologySectionParser`, `TopologySectionParser`, `TopologyRowSelectors`

- **`zte/`** — ZTE ZXHN H199A
  - `ZteH199ADriver.ts` — Router adapter
  - `ZteH199ASelectors.ts` — CSS selectors for the admin UI
  - `constants.ts` — Timeouts and delays

## Adding a new router driver

1. Create a folder under `drivers/` (e.g. `tp-link/`, `asus/`).
2. Implement a class extending `BaseRouter` (from `infra/router/BaseRouter.js`) and satisfying `IRouter`.
3. Add selectors and driver-specific constants in that folder.
4. Register the driver in `RouterFactory`: add a detection predicate and `create()` branch that instantiates your driver (inject shared dependencies like `TopologySectionParser` if needed).

Domain and application depend only on `IRouter`; they do not import from driver folders.
