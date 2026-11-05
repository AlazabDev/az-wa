import json,pathlib,collections,re
root=pathlib.Path(__file__).resolve().parents[1]
source=json.loads((root/'daftra.openapi.json').read_text())
base=root/'supabase/functions/daftra-mcp'
ops=json.loads((base/'catalog.json').read_text())
actual=sum(k.lower() in ('get','post','put','patch','delete') for p in source['paths'].values() for k in p)
assert actual==len(ops)==301,(actual,len(ops))
assert len(set(o['id'] for o in ops))==301
assert len(set((o['p'],o['m']) for o in ops))==301
from collections import Counter
for module,count in Counter(o['module'] for o in ops).items():
 path=base/'modules'/module
 assert path.is_file(),module
 content=path.read_text()
 assert content.count('"'+ '.ts'+'"')==0 # no invalid suffix references
 assert all('"'+o['id']+'"' in content for o in ops if o['module']==module)
print('PASS: 301 operations,',len(set(o['module'] for o in ops)),'modules, unique paths and IDs')
