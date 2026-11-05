#!/usr/bin/env python3
"""Generate supabase/functions/magicplan-mcp/catalog.json from the magicplan OpenAPI spec.

Usage: python3 scripts/gen_magicplan_catalog.py [path-to-magicplan_openapi.json]
"""
import json, re, sys, pathlib

spec_path = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-uploads/magicplan_openapi.json"
out_path = pathlib.Path(__file__).resolve().parents[1] / "supabase/functions/magicplan-mcp/catalog.json"

spec = json.loads(pathlib.Path(spec_path).read_text())
BASE = spec["servers"][0]["url"].rstrip("/")


def snake(name: str) -> str:
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_").lower()
    return re.sub(r"_+", "_", s)


def path_slug(path: str) -> str:
    parts = [p for p in path.strip("/").split("/") if p]
    words = []
    for p in parts:
        if p.startswith("{"):
            words.append("by_" + snake(p.strip("{}")))
        else:
            words.append(snake(p))
    return "_".join(words) or "root"


ops, used_ids = [], set()
for path, methods in spec["paths"].items():
    for method, op in methods.items():
        if method not in ("get", "post", "put", "patch", "delete"):
            continue
        oid = snake(op.get("operationId") or f"{method}_{path_slug(path)}")
        while oid in used_ids:
            oid = f"{oid}_{method}"
        used_ids.add(oid)
        tag = (op.get("tags") or ["General"])[0]
        params = []
        for p in op.get("parameters", []):
            if p.get("in") in ("path", "query") and not p.get("name", "").startswith("$"):
                desc = (p.get("description") or "").strip()
                params.append({
                    "n": p["name"],
                    "in": p["in"],
                    "r": bool(p.get("required")),
                    "d": desc[:160],
                })
        body = op.get("requestBody") or {}
        record = {
            "id": oid,
            "m": method.upper(),
            "p": path,
            "s": (op.get("summary") or oid).strip(),
            "t": tag,
            "module": snake(tag),
            "params": params,
        }
        if body:
            record["body"] = {"r": bool(body.get("required"))}
        ops.append(record)

out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps(ops, ensure_ascii=False, indent=1))
print(f"Wrote {len(ops)} operations to {out_path}")
print("Modules:", sorted({o["module"] for o in ops}))
dupes = [i for i in used_ids if sum(1 for o in ops if o["id"] == i) > 1]
assert not dupes, dupes
