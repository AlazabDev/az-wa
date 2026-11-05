#!/usr/bin/env node
// Conservative import-graph inventory of the TanStack runtime.
// An unreachable module is a merge candidate, not automatically safe to delete.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = join(root, "src");
const ext = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const codeFiles = [];
function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, item.name);
    if (item.isDirectory()) {
      if (!["node_modules", "__generated__"].includes(item.name)) walk(file);
    } else if (item.isFile() && ext.includes(extname(item.name)) && !/\.(?:test|spec)\.[jt]sx?$/.test(file)) {
      codeFiles.push(file);
    }
  }
}
walk(src);
const sourceSet = new Set(codeFiles);
function resolveLocal(from, specifier) {
  let path;
  if (specifier.startsWith("@/")) path = join(src, specifier.slice(2));
  else if (specifier.startsWith(".")) path = resolve(dirname(from), specifier);
  else return null;
  const candidates = [path, ...ext.map(e => path + e), ...ext.map(e => join(path, "index" + e))];
  return candidates.find(p => sourceSet.has(p)) ?? null;
}
const roots = codeFiles.filter(p => p.startsWith(join(src, "routes") + "/"));
for (const entry of ["router.tsx", "start.ts", "server.ts"]) {
  const path = join(src, entry);
  if (sourceSet.has(path)) roots.push(path);
}
const importsOf = text => {
  const imports = [];
  const fromRe = /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s*)?["']([^"'\n]+)["']/g;
  const dynamicRe = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
  for (const re of [fromRe, dynamicRe]) {
    for (const match of text.matchAll(re)) imports.push(match[1]);
  }
  return imports;
};
const visited = new Set();
const queue = [...roots];
const violations = [];
for (let index = 0; index < queue.length; index++) {
  const file = queue[index];
  if (visited.has(file)) continue;
  visited.add(file);
  for (const imp of importsOf(readFileSync(file, "utf8"))) {
    if (/^(?:next(?:\/|$)|next-intl(?:\/|$)|@xyflow\/react$)/.test(imp)) {
      violations.push(`${relative(root, file)} imports ${imp}`);
    }
    const local = resolveLocal(file, imp);
    if (local && !visited.has(local)) queue.push(local);
  }
}
const categories = [
  "components/dashboard", "components/flows", "components/agents",
  "components/inbox", "lib/whatsapp", "lib/flows",
  "lib/automations", "lib/ai", "pages",
];
console.log("AZWA integration graph | entry modules:", roots.length, "| reachable:", visited.size, "| source modules:", sourceSet.size);
for (const group of categories) {
  const members = codeFiles.filter(p => p.startsWith(join(src, group) + "/"));
  const active = members.filter(p => visited.has(p));
  console.log(`${group}: ${active.length} reachable / ${members.length} total; ${members.length - active.length} staged`);
}
if (violations.length) {
  console.error("Incompatible legacy imports found in active TanStack import graph:");
  violations.forEach(v => console.error(" - " + v));
  process.exitCode = 1;
} else {
  console.log("PASS: no Next.js or legacy flow dependency in active static import graph");
}
