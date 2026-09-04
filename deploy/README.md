# AzWA Deployment Documentation

Clean production deployment setup for **AzWA** (`wa.alazab.com`) using **PM2**, **Nginx**, and **Certbot**.

## Structure

* [`ecosystem.config.cjs`](file:///f:/Dev/wa/az-wa/deploy/ecosystem.config.cjs): PM2 cluster mode process management.
* [`nginx/wa.alazab.com`](file:///f:/Dev/wa/az-wa/deploy/nginx/wa.alazab.com): Clean HTTP Nginx reverse proxy configuration. (SSL cert paths omitted so Certbot automatically injects them).
* [`deploy.sh`](file:///f:/Dev/wa/az-wa/deploy/deploy.sh): Automated deploy script.

## Quick Start

Run on your production server:

```bash
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```
