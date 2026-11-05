# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File                     | URL                                                     |
| ------------------------ | ------------------------------------------------------- |
| `index.tsx`              | `/`                                                     |
| `about.tsx`              | `/about`                                                |
| `users/index.tsx`        | `/users`                                                |
| `users/$id.tsx`          | `/users/:id` (dynamic — bare `$`, no curly braces)      |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment)                  |
| `files/$.tsx`            | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx`            | layout route (renders children via `<Outlet />`)        |
| `__root.tsx`             | app shell — wraps every page; preserve `<Outlet />`     |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## Unified route inventory

`src/routes/` is the **only active URL routing tree**. Use
`bun run routes:sync` to refresh `docs/ROUTE_TREE.md` after a router build,
and `bun run test:routes` to verify all route IDs and generated imports.

The old `src/app/` Next.js handlers and `src/App.tsx` + `src/pages/`
React Router implementation are **legacy source**, not executable through the
TanStack router. Do not delete or move them until their imports, business logic,
API contracts, and tests have been migrated and verified.
