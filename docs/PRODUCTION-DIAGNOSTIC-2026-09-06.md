# AzWA Production Diagnostic — 2026-09-06

This release was finalized against the read-only diagnostic bundle collected from the live `wa.alazab.com` host.

## Observed live state

- Host: `azab-orchestrator`
- Live application directory: `/mnt/apps/az-wa`
- Git branch/commit: `main` / `181b5f44c02da035967e92c0f3af5f98981a7144`
- Node.js: `v24.16.0`
- npm: `12.0.2`
- PM2 installed: `7.0.1`
- Live Node artifact: `.output/server/index.mjs` exists
- Listener: `127.0.0.1:8085`
- Nginx configuration: syntax valid
- Public TLS: operational
- Root HTTP behavior: `307` redirect (expected application navigation)
- Health endpoint: operational during collection
- Disk use: 18%

## Production issues found and addressed by this release

1. `azwa-app` was not registered in PM2 even though the application was listening on port 8085.
   The release contains a canonical single-instance PM2 ecosystem configuration. Deployment refuses to kill an unknown listener automatically.
2. `/etc/az-wa/az-wa.env` did not exist. Secrets were still held in project-local `.env`, `.env.local`, and `meta/.env` files.
   `deploy/migrate-secrets.sh` merges these values without printing them, writes `/etc/az-wa/az-wa.env` mode `600`, and moves the old files into `_isolated_legacy/environment-history/server-migration/<timestamp>/` rather than deleting them.
3. `meta/.env` was mode `666`. The migration above removes it from the active project path and preserves it mode `600` in the isolated history directory.
4. Shared Nginx logs contained unrelated scanner traffic and failures from other virtual hosts. The canonical AzWA vhost now writes dedicated `wa.alazab.com.access.log` and `wa.alazab.com.error.log` files.
5. The generated route tree referenced inactive legacy route files. This release regenerates the production tree strictly from the 40 active route files; `/files` is included and legacy routes are excluded from the active tree.

## Package verification performed before release

- Active TypeScript/TSX source parsed: 168 files / 0 syntax errors.
- Production regression suite: 10/10 passing.
- Distribution secret scan: PASS.
- Bash syntax for active deploy/diagnostic scripts: PASS.
- Active migration inventory: six forward migrations.
- Release archive is accompanied by a SHA-256 manifest and is tested with `unzip -t` after packaging.

## Dependency lock policy

The live installation contains the exact production `package-lock.json` from commit `181b5f44c02da035967e92c0f3af5f98981a7144` (observed size 368877 bytes). Its Git blob is:

`9d9a8c3c0f84ef7b4604e9b7a66925d1d554ecab`

The distributable is an **overlay release** and intentionally does not invent or regenerate a lock while the packaging environment has no npm/GitHub DNS access. `deploy/deploy.sh` requires the existing exact lock and uses `npm ci`; a wrong or missing lock causes a hard failure before build/runtime cut-over.

## Safety guarantees

- No database reset/truncate/drop is part of deployment.
- Migrations are optional and require `--apply-migrations`; a dry run is performed first.
- Nginx is not changed unless `--sync-nginx` is explicitly supplied.
- Unknown processes listening on 8085 are never killed automatically.
- Existing `.output` is archived before a new build and restored on build/deploy failure.
- Historical source is preserved under `_isolated_legacy`; raw credentials/private keys are not distributed in the production archive.
