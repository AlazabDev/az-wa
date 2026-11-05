#!/usr/bin/env python3
"""Regenerate module operation-id lists from catalog.json, without altering the catalog."""
import json,pathlib,collections
root=pathlib.Path(__file__).resolve().parents[1]
base=root/'supabase/functions/daftra-mcp'
ops=json.loads((base/'catalog.json').read_text())
groups=collections.defaultdict(list)
for op in ops: groups[op['module']].append(op['id'])
for name, ids in groups.items():
    target=base/'modules'/name
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text('/** Generated from catalog.json */\nexport const operationIds = '+json.dumps(ids,indent=2)+' as const;\n')
print(len(ops),'operations across',len(groups),'modules')
