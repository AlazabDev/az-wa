#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_DIR="${APP_DIR:-/mnt/apps/az-wa}"
TARGET_DIR="${AZWA_ENV_DIR:-/etc/az-wa}"
TARGET_FILE="${AZWA_ENV_FILE:-$TARGET_DIR/az-wa.env}"
STAMP="$(date +%Y%m%d_%H%M%S)"
ARCHIVE_DIR="$APP_DIR/_isolated_legacy/environment-history/server-migration/$STAMP"

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "ERROR: run with sudo/root" >&2; exit 77; }
command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 is required" >&2; exit 69; }
mkdir -p "$ARCHIVE_DIR"
chmod 700 "$ARCHIVE_DIR"
install -d -m 700 -o root -g root "$TARGET_DIR"

sources=("$APP_DIR/.env" "$APP_DIR/meta/.env" "$APP_DIR/.env.local")
existing=()
for f in "${sources[@]}"; do [[ -f "$f" ]] && existing+=("$f"); done
if ((${#existing[@]} == 0)) && [[ ! -f "$TARGET_FILE" ]]; then
  echo "ERROR: no legacy env files found and target does not exist" >&2
  exit 66
fi

if [[ -f "$TARGET_FILE" ]]; then
  cp -a "$TARGET_FILE" "$ARCHIVE_DIR/az-wa.env.before-migration"
  chmod 600 "$ARCHIVE_DIR/az-wa.env.before-migration"
fi

python3 - "$TARGET_FILE" "${existing[@]}" <<'PY'
from pathlib import Path
import os,re,sys,tempfile

target=Path(sys.argv[1])
sources=[Path(x) for x in sys.argv[2:]]
entries={}
order=[]

def ingest(path):
    if not path.exists(): return
    for line in path.read_text(errors='replace').splitlines():
        m=re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$', line)
        if not m: continue
        k,v=m.group(1),m.group(2)
        if k not in entries: order.append(k)
        entries[k]=v

if target.exists(): ingest(target)
for source in sources: ingest(source)

target.parent.mkdir(parents=True, exist_ok=True)
fd,tmp=tempfile.mkstemp(prefix='az-wa.env.', dir=str(target.parent), text=True)
try:
    with os.fdopen(fd,'w') as f:
        for key in order:
            f.write(f'{key}={entries[key]}\n')
    os.chmod(tmp,0o600)
    os.replace(tmp,target)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
print(f'Merged {len(entries)} environment keys; values were not printed.')
PY
chown root:root "$TARGET_FILE"
chmod 600 "$TARGET_FILE"

for f in "${existing[@]}"; do
  rel="${f#$APP_DIR/}"
  dest="$ARCHIVE_DIR/$rel"
  mkdir -p "$(dirname "$dest")"
  mv "$f" "$dest"
  chmod 600 "$dest"
done

printf 'Production env: %s (mode %s)\n' "$TARGET_FILE" "$(stat -c '%a' "$TARGET_FILE")"
printf 'Legacy env files preserved under: %s\n' "$ARCHIVE_DIR"
printf 'No secret values were printed.\n'
