# AzWA Deployment

`deploy.sh` deploys **only the AzWA app** (PM2 process `azwa-app` on 127.0.0.1:8085).
It never reads, writes or reloads Nginx — the server hosts other apps.
`nginx/wa.alazab.com` is a reference file only; apply it manually if ever needed.

```bash
./deploy/deploy.sh                      # build + reload azwa-app
./deploy/deploy.sh --apply-migrations   # also push DB migrations
```
