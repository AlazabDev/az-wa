#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")
    print(f"fixed {rel}")


def replace_once(rel: str, old: str, new: str) -> None:
    text = read(rel)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{rel}: expected exactly one match for {old!r}, found {count}")
    write(rel, text.replace(old, new, 1))


def replace_all(rel: str, old: str, new: str, minimum: int = 1) -> None:
    text = read(rel)
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f"{rel}: expected at least {minimum} matches for {old!r}, found {count}")
    write(rel, text.replace(old, new))


# 1) React class overrides required by noImplicitOverride.
path = "src/components/ErrorBoundary.tsx"
text = read(path)
for old, new in [
    ("  state: State = { error: null };", "  override state: State = { error: null };"),
    ("  componentDidCatch(error: Error, info: ErrorInfo) {", "  override componentDidCatch(error: Error, info: ErrorInfo) {"),
    ("  render() {", "  override render() {"),
]:
    if text.count(old) != 1:
        raise RuntimeError(f"{path}: expected one match for {old!r}")
    text = text.replace(old, new, 1)
write(path, text)

# 2) exactOptionalPropertyTypes: do not spread an explicitly undefined anchor target into TanStack Link.
path = "src/components/NavLink.tsx"
text = read(path)
old = "  ({ className, activeClassName, pendingClassName: _pendingClassName, to, end, ...props }, ref) => {"
new = "  ({ className, activeClassName, pendingClassName: _pendingClassName, to, end, target, ...props }, ref) => {"
if text.count(old) != 1:
    raise RuntimeError(f"{path}: NavLink destructuring anchor not found")
text = text.replace(old, new, 1)
old = "        {...props}\n      />"
new = "        {...props}\n        {...(target !== undefined ? { target } : {})}\n      />"
if text.count(old) != 1:
    raise RuntimeError(f"{path}: NavLink props spread anchor not found")
text = text.replace(old, new, 1)
write(path, text)

# 3) TS4111 index-signature access in Accounts.
path = "src/pages/Accounts.tsx"
text = read(path)
replacements = {
    "import.meta.env.VITE_SUPABASE_URL": 'import.meta.env["VITE_SUPABASE_URL"]',
    "qualityColors.UNKNOWN": 'qualityColors["UNKNOWN"]',
}
for old, new in replacements.items():
    if old not in text:
        raise RuntimeError(f"{path}: missing expected expression {old}")
    text = text.replace(old, new)
write(path, text)

# 4) FlowBuilder: safe array move plus bracket access for Record<string, string> config.
path = "src/pages/FlowBuilder.tsx"
text = read(path)
old = "    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];\n    setSteps(newSteps);"
new = "    const currentStep = newSteps[index];\n    const targetStep = newSteps[targetIndex];\n    if (!currentStep || !targetStep) return;\n    newSteps[index] = targetStep;\n    newSteps[targetIndex] = currentStep;\n    setSteps(newSteps);"
if text.count(old) != 1:
    raise RuntimeError(f"{path}: moveStep swap anchor not found")
text = text.replace(old, new, 1)
text, count = re.subn(r"step\.config\.([A-Za-z_][A-Za-z0-9_]*)", r'step.config["\1"]', text)
if count < 10:
    raise RuntimeError(f"{path}: expected many step.config dot accesses, replaced only {count}")
write(path, text)

# 5) noUncheckedIndexedAccess fallbacks for map lookups.
replace_once(
    "src/pages/Flows.tsx",
    "          const status = statusMap[flow.status];",
    '          const status = statusMap[flow.status] ?? statusMap["draft"]!;',
)

path = "src/pages/Maintenance.tsx"
text = read(path)
old = "            const priority = priorityMap[req.priority];\n            const status = statusMap[req.status];"
new = '            const priority = priorityMap[req.priority] ?? priorityMap["عادي"]!;\n            const status = statusMap[req.status] ?? statusMap["open"]!;'
if text.count(old) != 1:
    raise RuntimeError(f"{path}: priority/status lookup anchor not found")
write(path, text.replace(old, new, 1))

replace_once(
    "src/pages/Projects.tsx",
    "            const status = statusMap[project.status];",
    '            const status = statusMap[project.status] ?? statusMap["planning"]!;',
)

# 6) Settings: guard first array element and use bracket access on env record.
path = "src/pages/Settings.tsx"
text = read(path)
old = "      const firstOk = data.numbers.find((n) => n.ok) ?? data.numbers[0];\n      setTestNumberId(firstOk.id);"
new = "      const firstOk = data.numbers.find((n) => n.ok) ?? data.numbers[0];\n      if (firstOk) setTestNumberId(firstOk.id);"
if text.count(old) != 1:
    raise RuntimeError(f"{path}: firstOk anchor not found")
text = text.replace(old, new, 1)
count = text.count(".WA_WEBHOOK_VERIFY_TOKEN")
if count < 3:
    raise RuntimeError(f"{path}: expected 3 WA_WEBHOOK_VERIFY_TOKEN dot accesses, found {count}")
text = text.replace(".WA_WEBHOOK_VERIFY_TOKEN", '["WA_WEBHOOK_VERIFY_TOKEN"]')
write(path, text)

# 7) Templates: exact optional header type, bracket fallback, and defined status.
path = "src/pages/Templates.tsx"
text = read(path)
if text.count("  headerType?: string;") != 1:
    raise RuntimeError(f"{path}: headerType declaration anchor not found")
text = text.replace("  headerType?: string;", "  headerType?: string | undefined;", 1)
old = "            const status = statusMap[template.status] || statusMap.DRAFT;"
new = '            const status = statusMap[template.status] ?? statusMap["DRAFT"]!;'
if text.count(old) != 1:
    raise RuntimeError(f"{path}: template status anchor not found")
text = text.replace(old, new, 1)
write(path, text)

# 8) Webhooks: keep a defined local stat object; make submit handler consistently return void.
path = "src/pages/Webhooks.tsx"
text = read(path)
old = '''      (data || []).forEach((d: any) => {
        if (!stats[d.target_id]) stats[d.target_id] = { total: 0, success: 0, failed: 0 };
        stats[d.target_id].total++;
        if (d.status === "delivered") stats[d.target_id].success++;
        else if (d.status === "failed") stats[d.target_id].failed++;
      });'''
new = '''      (data || []).forEach((d: any) => {
        const targetId = String(d.target_id);
        const stat = stats[targetId] ?? (stats[targetId] = { total: 0, success: 0, failed: 0 });
        stat.total++;
        if (d.status === "delivered") stat.success++;
        else if (d.status === "failed") stat.failed++;
      });'''
if text.count(old) != 1:
    raise RuntimeError(f"{path}: delivery stats block not found")
text = text.replace(old, new, 1)
old = '''  const handleSubmit = () => {
    if (!url) return toast.error("يرجى إدخال رابط نقطة النهاية");
    if (selectedEvents.length === 0) return toast.error("يرجى اختيار حدث واحد على الأقل");
    createMutation.mutate();
  };'''
new = '''  const handleSubmit = () => {
    if (!url) {
      toast.error("يرجى إدخال رابط نقطة النهاية");
      return;
    }
    if (selectedEvents.length === 0) {
      toast.error("يرجى اختيار حدث واحد على الأقل");
      return;
    }
    createMutation.mutate();
  };'''
if text.count(old) != 1:
    raise RuntimeError(f"{path}: handleSubmit block not found")
text = text.replace(old, new, 1)
write(path, text)

# 9) legacy.login.tsx Record access.
path = "src/routes/legacy.login.tsx"
text = read(path)
count = text.count("search.from")
if count != 2:
    raise RuntimeError(f"{path}: expected 2 search.from accesses, found {count}")
write(path, text.replace("search.from", 'search["from"]'))

# 10) Remove stale tsconfig exclusions now that legacy pages/components are mounted routes.
path = "tsconfig.json"
data = json.loads(read(path))
remove = {
    "src/pages",
    "src/contexts",
    "src/components/AppLayout.tsx",
    "src/components/AppSidebar.tsx",
    "src/components/ErrorBoundary.tsx",
    "src/components/NavLink.tsx",
    "src/components/ProtectedRoute.tsx",
}
exclude = data.get("exclude", [])
data["exclude"] = [item for item in exclude if item not in remove]
left = remove.intersection(data["exclude"])
if left:
    raise RuntimeError(f"{path}: failed to remove exclusions: {sorted(left)}")
write(path, json.dumps(data, ensure_ascii=False, indent=2) + "\n")

# 11) Add a visible Legacy section in the new AppShell.
path = "src/components/azwa/app-shell.tsx"
text = read(path)
anchor = '''  {
    section: "Administration",
    items: [
      { label: "Users & Roles", to: "/users", icon: ShieldCheck },
      { label: "Audit Logs", to: "/audit", icon: ScrollText },
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];'''
replacement = '''  {
    section: "Administration",
    items: [
      { label: "Users & Roles", to: "/users", icon: ShieldCheck },
      { label: "Audit Logs", to: "/audit", icon: ScrollText },
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
  {
    section: "Legacy",
    items: [{ label: "Legacy Hub", to: "/legacy/", icon: Boxes }],
  },
];'''
if text.count(anchor) != 1:
    raise RuntimeError(f"{path}: AppShell NAV anchor not found")
write(path, text.replace(anchor, replacement, 1))

print("All final tsgo repairs applied successfully.")
