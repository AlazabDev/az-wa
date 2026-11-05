import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const root = read('src/routes/__root.tsx');
const shell = read('src/components/azwa/app-shell.tsx');
const styles = read('src/styles.css');
const dashboard = read('src/routes/_authenticated/dashboard.tsx');
const auth = read('src/routes/_authenticated/route.tsx');

test('Arabic document and RTL are declared in the TanStack root shell', () => {
  assert.match(root, /<html lang="ar" dir="rtl">/);
});
test('existing authentication and server-side organization scope protection preserved', () => {
  assert.match(auth, /getAuthenticatedOrganizationScopes/);
  assert.match(auth, /supabase\.auth\.getUser\(/);
  assert.match(auth, /<AppShell>/);
});
test('existing navigation routes preserved', () => {
  for(const route of ['/dashboard','/inbox','/contacts','/numbers','/wabas','/webhooks','/credentials','/settings','/audit','/flows','/campaigns','/automation']) {
    assert.ok(shell.includes(`to: "${route}"`), `missing ${route}`);
  }
});
test('navigation has keyboard-accessible mobile drawer and right-side positioning', () => {
  assert.match(shell, /aria-controls="azwa-main-navigation"/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /right-0/);
  assert.match(shell, /lg:hidden/);
  assert.match(shell, /aria-current=\{active \? "page"/);
});
test('brand primary and light navigation color tokens match design brief', () => {
  assert.match(styles, /--primary: #030957;/);
  assert.match(styles, /--sidebar: #ffffff;/);
  assert.match(styles, /--azwa-nav-active: #dcfce7;/);
});
test('RTL numeric/code isolation and reduced motion preferences', () => {
  assert.match(styles, /\.ltr-data/);
  assert.match(styles, /prefers-reduced-motion/);
});
test('dashboard preserves live numbers, WABAs and operations metrics', () => {
  for(const name of ['useNumbers','useWabas','useOpsCounters','numbersInScope','StatusBadge']) assert.ok(dashboard.includes(name));
  assert.match(dashboard, /لوحة|نظرة عامة/);
});
