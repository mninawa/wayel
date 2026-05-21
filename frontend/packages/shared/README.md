# @wayel/shared

Shared Angular sources consumed by both `apps/REMOVED` and `apps/client-portal`.

This package has **no build step**. Each Angular app references the sources directly via TypeScript path aliases (`@wayel/shared/*`) and Angular's own compiler inlines them. That keeps the loop tight: edit a contract or bridge service here and both apps pick up the change on the next build/serve cycle.

## What lives here

- `src/core/contracts/` — Phase 0 DTO/request/response interfaces (the "API contracts").
- `src/core/mock/` — In-memory seed data + helpers for `useMock=true` mode.
- `src/core/tokens/` — Injection tokens (e.g. `PLATFORM_API_URL`).
- `src/services/` — `HttpClient`-backed API services + bridge services that route between mock and live.
- `src/interceptors/` — Cross-cutting HTTP interceptors (e.g. platform auth).
- `src/utils/` — Generic helpers (HTTP error formatting, etc.).

Each app keeps its own concrete `environment.ts` / `environment.prod.ts` because their API URLs and feature flags differ.

## Path alias

In each app's `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@wayel/shared/*": ["../../packages/shared/src/*"]
    }
  }
}
```

Then import as e.g.:

```ts
import type { Phase0ChildDetailDto } from '@wayel/shared/core/contracts/children.phase0';
import { ChildrenBridgeService } from '@wayel/shared/services/children-bridge.service';
```

## Environment dependency

Bridge services check `environment.useMock` to switch between mock and live data. Each app exposes its own environment as a virtual module by adding this to its `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@wayel/shared/*": ["../../packages/shared/src/*"],
      "@app/environment": ["src/environments/environment.ts"]
    }
  }
}
```

The shared services import from `@app/environment`, which the host app maps to its own concrete env. This keeps each app's flags independent while giving the shared services a single import path.
