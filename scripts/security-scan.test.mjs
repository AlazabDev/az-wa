import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function scan(files) {
  const dir = mkdtempSync(join(tmpdir(), 'azwa-security-scan-'));
  try {
    copyFileSync(new URL('./security-scan.mjs', import.meta.url), join(dir, 'scan.mjs'));
    for (const [filename, content] of Object.entries(files)) {
      const path = join(dir, filename);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, content);
    }
    const result = spawnSync(process.execPath, ['scan.mjs'], { cwd: dir, encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('detects standalone Meta tokens', () => {
  const value = 'EAA' + 'z'.repeat(32);
  const result = scan({ 'file.ts': `const metaToken = '${value}';` });
  assert.equal(result.status, 1);
  assert.match(result.output, /Meta token/);
  assert.doesNotMatch(result.output, /EAAz/);
});
test('ignores token-like substrings inside longer base64 or minified identifier', () => {
  const result = scan({ 'file.ts': `const image = 'AAA${'EAA' + 'z'.repeat(32)}';` });
  assert.equal(result.status, 0);
});
test('detects populated secret values in .env files', () => {
  const result = scan({ '.env.local': 'META_APP_SECRET=example-secret-value\n' });
  assert.equal(result.status, 1);
  assert.match(result.output, /Populated sensitive env value/);
  assert.doesNotMatch(result.output, /example-secret-value/);
});


test('ignores untracked, gitignored local runtime secrets but catches tracked secrets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'azwa-scan-git-'));
  try {
    copyFileSync(new URL('./security-scan.mjs', import.meta.url), join(dir, 'scan.mjs'));
    writeFileSync(join(dir, '.gitignore'), '.env.local\n');
    writeFileSync(join(dir, '.env.local'), 'META_APP_SECRET=local-only-test\n');
    writeFileSync(join(dir, 'app.js'), 'export const x = 1;\n');
    const git = (...args) => spawnSync('git', args, {cwd:dir,encoding:'utf8'});
    assert.equal(git('init','-q').status,0);
    assert.equal(git('add','scan.mjs','app.js','.gitignore').status,0);
    const ignored = spawnSync(process.execPath,['scan.mjs'],{cwd:dir,encoding:'utf8'});
    assert.equal(ignored.status,0,ignored.stderr);
    // Force-track a file that was previously ignored; it must be examined.
    assert.equal(git('add','-f','.env.local').status,0);
    const tracked = spawnSync(process.execPath,['scan.mjs'],{cwd:dir,encoding:'utf8'});
    assert.equal(tracked.status,1);
    assert.match(tracked.stderr,/Populated sensitive env value META_APP_SECRET/);
  } finally {
    rmSync(dir,{recursive:true,force:true});
  }
});
