#!/usr/bin/env bun

import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

const icons = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
  fix: "🔧",
  database: "🗄️",
};

function runCommand(command: string): { success: boolean; output: string } {
  try {
    const output = execSync(command, { encoding: "utf-8", stdio: "pipe" });
    return { success: true, output };
  } catch (error: any) {
    return { success: false, output: error.stdout || error.message };
  }
}

async function main() {
  console.log(
    `\n${colors.blue}${colors.bold}╔══════════════════════════════════════════════════════════╗${colors.reset}`,
  );
  console.log(
    `${colors.blue}${colors.bold}║        إصلاح شامل لمشاكل الترحيلات                       ║${colors.reset}`,
  );
  console.log(
    `${colors.blue}${colors.bold}╚══════════════════════════════════════════════════════════╝${colors.reset}\n`,
  );

  // 1. إصلاح ملفات الترحيل
  console.log(`${colors.yellow}${icons.fix} الخطوة 1: إصلاح ملفات الترحيل المحلية${colors.reset}`);
  const migrationsDir = join(process.cwd(), "supabase", "migrations");

  if (existsSync(migrationsDir)) {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    let fixedCount = 0;

    for (const file of files) {
      const filePath = join(migrationsDir, file);
      let content = readFileSync(filePath, "utf-8");
      let modified = false;

      // إضافة IF NOT EXISTS لـ CREATE TYPE
      if (content.includes("CREATE TYPE") && !content.includes("IF NOT EXISTS")) {
        content = content.replace(
          /CREATE TYPE\s+(\w+\.)?(\w+)\s+AS\s+ENUM/g,
          "CREATE TYPE IF NOT EXISTS $1$2 AS ENUM",
        );
        modified = true;
      }

      // إضافة IF NOT EXISTS لـ CREATE TABLE
      if (content.includes("CREATE TABLE") && !content.includes("IF NOT EXISTS")) {
        content = content.replace(
          /CREATE TABLE\s+(\w+\.)?(\w+)/g,
          "CREATE TABLE IF NOT EXISTS $1$2",
        );
        modified = true;
      }

      // إضافة IF NOT EXISTS لـ CREATE INDEX
      if (content.includes("CREATE INDEX") && !content.includes("IF NOT EXISTS")) {
        content = content.replace(/CREATE INDEX\s+(\w+)\s+ON/g, "CREATE INDEX IF NOT EXISTS $1 ON");
        modified = true;
      }

      if (modified) {
        writeFileSync(filePath, content);
        fixedCount++;
        console.log(`  ${icons.fix} تم إصلاح: ${file}`);
      }
    }

    console.log(`  ${icons.success} تم إصلاح ${fixedCount} ملف من أصل ${files.length}`);
  } else {
    console.log(`  ${icons.warning} مجلد migrations غير موجود`);
  }

  // 2. محاولة الرفع
  console.log(`\n${colors.yellow}${icons.database} الخطوة 2: محاولة رفع التغييرات${colors.reset}`);
  const pushResult = runCommand("supabase db push");

  if (pushResult.success) {
    console.log(`  ${icons.success} ✅ تم رفع التغييرات بنجاح!`);
  } else {
    console.log(`  ${icons.error} ❌ فشل الرفع:`);
    console.log(`  ${pushResult.output.substring(0, 500)}`);

    // 3. حل بديل: استخدام --use-migra
    console.log(`\n${colors.yellow}${icons.fix} الخطوة 3: محاولة استخدام migra${colors.reset}`);
    const migraResult = runCommand("supabase db push --use-migra");

    if (migraResult.success) {
      console.log(`  ${icons.success} ✅ تم الرفع باستخدام migra!`);
    } else {
      console.log(`  ${icons.warning} يرجى مراجعة الأخطاء يدوياً`);
      console.log(`  ${migraResult.output.substring(0, 500)}`);
    }
  }
}

main().catch(console.error);
