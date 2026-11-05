import json,re,pathlib
root=pathlib.Path(__file__).resolve().parents[1]/'supabase/functions/daftra-mcp'
ops=json.loads((root/'catalog.json').read_text())
modules=[p for p in (root/'modules').rglob('*.ts') if p.name not in ('registry.ts','catalog-runner.ts')]
assert len(modules)==70,(len(modules),'modules')
registered=[]
for p in modules:
 source=p.read_text(); assert 'function execute(' in source,p
 ids=json.loads(re.search(r"operationIds = (\[[\s\S]*?\]) as const",source).group(1));registered+=ids
assert len(registered)==301,len(registered)
assert len(set(registered))==301
assert set(registered)=={o['id'] for o in ops}
reg=(root/'modules/registry.ts').read_text()
for p in modules: assert './'+p.relative_to(root/'modules').as_posix() in reg,p
index=(root/'index.ts').read_text();assert 'executeRegistered(op,a)' in index
print('PASS: 70 imported executable modules, 301 operations, runtime registry bound')
