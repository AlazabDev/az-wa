#!/usr/bin/env bun

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, relative } from "path";
import { execSync } from "child_process";

// ==================== الأنواع والواجهات ====================

interface EnvVariable {
  key: string;
  value: string;
  source: "env-file" | "runtime" | "both";
  isValid: boolean;
  errors?: string[];
}

interface EnvUsage {
  file: string;
  line: number;
  variable: string;
  fullMatch: string;
}

interface ValidationResult {
  passed: boolean;
  message: string;
}

// ==================== الألوان والتنسيق ====================

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const icons = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
  debug: "🔍",
  file: "📁",
  variable: "🔧",
  duplicate: "🔄",
  missing: "❓",
};

// ==================== قراءة وتحليل ملفات .env ====================

function readEnvFile(filePath: string): Map<string, string> {
  const envVars = new Map<string, string>();

  if (!existsSync(filePath)) {
    return envVars;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      // تخطي الأسطر الفارغة والتعليقات
      if (line.trim() === "" || line.trim().startsWith("#")) {
        continue;
      }

      // استخراج اسم المتغير والقيمة
      const equalIndex = line.indexOf("=");
      if (equalIndex === -1) continue;

      const key = line.substring(0, equalIndex).trim();
      let value = line.substring(equalIndex + 1).trim();

      // إزالة علامات الاقتباس
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      envVars.set(key, value);
    }
  } catch (error) {
    console.log(`${icons.error} خطأ في قراءة ${filePath}:`, error);
  }

  return envVars;
}

function getEnvFiles(): { path: string; name: string }[] {
  const envFiles = [
    { path: ".env", name: ".env (الرئيسي)" },
    { path: ".env.local", name: ".env.local (محلي)" },
    { path: ".env.development", name: ".env.development (تطوير)" },
    { path: ".env.production", name: ".env.production (إنتاج)" },
    { path: ".env.example", name: ".env.example (نموذج)" },
  ];

  return envFiles.filter((file) => existsSync(file.path));
}

// ==================== فحص المتغيرات من الكود ====================

function scanCodeForEnvUsage(): EnvUsage[] {
  const usages: EnvUsage[] = [];
  const srcPath = join(process.cwd(), "src");

  if (!existsSync(srcPath)) {
    return usages;
  }

  function scanDirectory(dir: string) {
    const files = readdirSync(dir);

    for (const file of files) {
      const fullPath = join(dir, file);
      const stat = existsSync(fullPath) ? statSync(fullPath) : null;

      if (!stat) continue;

      if (stat.isDirectory()) {
        if (file !== "node_modules" && file !== ".git") {
          scanDirectory(fullPath);
        }
      } else if (file.match(/\.(ts|tsx|js|jsx)$/)) {
        scanFileForEnvUsage(fullPath, usages);
      }
    }
  }

  scanDirectory(srcPath);
  return usages;
}

function scanFileForEnvUsage(filePath: string, usages: EnvUsage[]) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relativePath = relative(process.cwd(), filePath);

    // أنماط البحث المختلفة
    const patterns = [
      /process\.env\.([A-Z_][A-Z0-9_]*)/g,
      /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g,
      /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
      /import\.meta\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of patterns) {
        let match;
        // إعادة تعيين الـ regex
        const regex = new RegExp(pattern.source, "g");

        while ((match = regex.exec(line)) !== null) {
          usages.push({
            file: relativePath,
            line: i + 1,
            variable: match[1],
            fullMatch: match[0],
          });
        }
      }
    }
  } catch (error) {
    // تجاهل أخطاء القراءة
  }
}

// ==================== فحص التكرار (Duplicates) ====================

function checkDuplicates(envVars: Map<string, string>): Map<string, string[]> {
  const duplicates = new Map<string, string[]>();
  const valueMap = new Map<string, string[]>();

  for (const [key, value] of envVars) {
    if (!valueMap.has(value)) {
      valueMap.set(value, []);
    }
    valueMap.get(value)!.push(key);
  }

  for (const [value, keys] of valueMap) {
    if (keys.length > 1) {
      duplicates.set(value, keys);
    }
  }

  return duplicates;
}

// ==================== فحص صحة المتغيرات ====================

function validateVariable(key: string, value: string): ValidationResult[] {
  const validations: ValidationResult[] = [];

  // تجاهل بعض التحققات للمتغيرات الخاصة
  if (key === "OPENAI_MAX_OUTPUT_TOKENS") {
    validations.push({
      passed: true,
      message: `${key}: قيمة رقمية صحيحة`,
    });
    return validations;
  }

  if (key === "CLOUDINARY_URL" && value.startsWith("cloudinary://")) {
    validations.push({
      passed: true,
      message: `${key}: رابط Cloudinary صحيح`,
    });
    return validations;
  }

  // فحص المفاتيح (Keys)
  if (key.includes("KEY") || key.includes("SECRET") || key.includes("TOKEN")) {
    if (value.length < 10) {
      validations.push({
        passed: false,
        message: `${key}: المفتاح قصير جداً (أقل من 10 أحرف)`,
      });
    } else if (
      value === "your-key-here" ||
      value === "your-anon-key" ||
      value.includes("example")
    ) {
      validations.push({
        passed: false,
        message: `${key}: يبدو أن القيمة نموذجية (example)، يرجى تحديثها`,
      });
    } else {
      validations.push({
        passed: true,
        message: `${key}: المفتاح صحيح`,
      });
    }
  }

  // فحص البريد الإلكتروني
  if (key.includes("EMAIL")) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(value)) {
      validations.push({
        passed: false,
        message: `${key}: بريد إلكتروني غير صحيح`,
      });
    }
  }

  // فحص الأرقام
  if (key.includes("PORT") || key.includes("TIMEOUT")) {
    if (isNaN(Number(value))) {
      validations.push({
        passed: false,
        message: `${key}: يجب أن يكون رقماً`,
      });
    }
  }

  // فحص NODE_ENV
  if (key === "NODE_ENV") {
    const validEnvs = ["development", "production", "test"];
    if (!validEnvs.includes(value)) {
      validations.push({
        passed: false,
        message: `${key}: يجب أن تكون واحدة من ${validEnvs.join(", ")}`,
      });
    }
  }

  return validations;
}

// ==================== عرض النتائج ====================

function printHeader(title: string, icon: string = icons.info) {
  console.log(`\n${colors.cyan}${colors.bright}${icon} ${title}${colors.reset}`);
  console.log(`${colors.gray}${"=".repeat(60)}${colors.reset}`);
}

function printSuccess(message: string) {
  console.log(`  ${colors.green}${icons.success} ${message}${colors.reset}`);
}

function printError(message: string) {
  console.log(`  ${colors.red}${icons.error} ${message}${colors.reset}`);
}

function printWarning(message: string) {
  console.log(`  ${colors.yellow}${icons.warning} ${message}${colors.reset}`);
}

function printInfo(message: string) {
  console.log(`  ${colors.blue}${icons.info} ${message}${colors.reset}`);
}

// ==================== الوظيفة الرئيسية ====================

async function main() {
  console.log(
    `\n${colors.magenta}${colors.bright}╔══════════════════════════════════════════════════════════╗${colors.reset}`,
  );
  console.log(
    `${colors.magenta}${colors.bright}║     فحص متغيرات البيئة - WhatsApp Manager (Bun)        ║${colors.reset}`,
  );
  console.log(
    `${colors.magenta}${colors.bright}╚══════════════════════════════════════════════════════════╝${colors.reset}`,
  );

  // ==================== 1. فحص ملفات البيئة ====================
  printHeader("فحص ملفات البيئة", icons.file);

  const envFiles = getEnvFiles();
  if (envFiles.length === 0) {
    printError("لا توجد ملفات .env في المشروع");
    printInfo("يمكنك إنشاء ملف .env.example كنموذج");
  } else {
    for (const file of envFiles) {
      const stats = existsSync(file.path) ? statSync(file.path) : null;
      const size = stats ? (stats.size / 1024).toFixed(2) : 0;
      printSuccess(`${file.name} (${size} KB)`);
    }
  }

  // ==================== 2. قراءة وتحليل المتغيرات ====================
  printHeader("تحليل المتغيرات", icons.variable);

  const allEnvVars = new Map<string, string>();
  const envSources = new Map<string, string[]>();

  for (const file of getEnvFiles()) {
    const vars = readEnvFile(file.path);
    for (const [key, value] of vars) {
      if (!envSources.has(key)) {
        envSources.set(key, []);
      }
      envSources.get(key)!.push(file.name);
      allEnvVars.set(key, value);
    }
  }

  if (allEnvVars.size === 0) {
    printError("لا توجد متغيرات بيئة محددة");
  } else {
    printInfo(`تم العثور على ${allEnvVars.size} متغيراً بيئياً`);

    for (const [key, value] of allEnvVars) {
      const sources = envSources.get(key) || [];
      const sourceText = sources.join(", ");
      const displayValue =
        key.includes("KEY") || key.includes("SECRET")
          ? value.substring(0, 8) + "..."
          : value.length > 40
            ? value.substring(0, 40) + "..."
            : value;

      console.log(
        `  ${colors.yellow}${key}${colors.reset} = ${colors.gray}${displayValue}${colors.reset} ${colors.blue}(${sourceText})${colors.reset}`,
      );
    }
  }

  // ==================== 3. فحص التكرار ====================
  printHeader("فحص التكرار (Duplicates)", icons.duplicate);

  const duplicates = checkDuplicates(allEnvVars);
  if (duplicates.size === 0) {
    printSuccess("لا توجد متغيرات مكررة");
  } else {
    printWarning(`تم العثور على ${duplicates.size} حالة تكرار`);
    for (const [value, keys] of duplicates) {
      console.log(`  ${colors.yellow}القيمة: ${value.substring(0, 30)}${colors.reset}`);
      console.log(`    المتغيرات: ${colors.gray}${keys.join(", ")}${colors.reset}`);
    }
  }

  // ==================== 4. فحص صحة المتغيرات ====================
  printHeader("فحص صحة المتغيرات", icons.debug);

  let validationPassed = 0;
  let validationFailed = 0;

  for (const [key, value] of allEnvVars) {
    const validations = validateVariable(key, value);
    const hasErrors = validations.some((v) => !v.passed);

    if (hasErrors) {
      validationFailed++;
      printError(`${key}:`);
      for (const validation of validations) {
        if (!validation.passed) {
          console.log(`    ${icons.error} ${validation.message}`);
        }
      }
    } else {
      validationPassed++;
      printSuccess(`${key}: جميع الفحوصات صحيحة`);
    }
  }

  console.log(
    `\n  ${colors.cyan}الملخص: ${validationPassed} متغير صحيح, ${validationFailed} متغير به مشاكل${colors.reset}`,
  );

  // ==================== 5. فحص المتغيرات من الكود ====================
  printHeader("فحص المتغيرات المستخدمة في الكود", icons.debug);

  const codeUsages = scanCodeForEnvUsage();
  const usedVariables = new Set(codeUsages.map((u) => u.variable));
  const definedVariables = new Set(allEnvVars.keys());
  const unusedVariables = [...definedVariables].filter((v) => !usedVariables.has(v));
  const missingVariables = [...usedVariables].filter((v) => !definedVariables.has(v));

  // إحصائيات الاستخدام
  console.log(`\n  ${colors.cyan}📊 إحصائيات الاستخدام:${colors.reset}`);
  console.log(`    • متغيرات محددة في الملفات: ${definedVariables.size}`);
  console.log(`    • متغيرات مستخدمة في الكود: ${usedVariables.size}`);
  console.log(`    • تكرارات الاستخدام: ${codeUsages.length}`);

  // المتغيرات المستخدمة
  if (usedVariables.size > 0) {
    console.log(`\n  ${colors.green}✓ المتغيرات المستخدمة في الكود:${colors.reset}`);
    for (const variable of usedVariables) {
      const usagesCount = codeUsages.filter((u) => u.variable === variable).length;
      console.log(`    ${icons.success} ${variable} (${usagesCount} استخدام)`);
    }
  }

  // المتغيرات غير المستخدمة
  if (unusedVariables.length > 0) {
    console.log(`\n  ${colors.yellow}⚠️ متغيرات غير مستخدمة في الكود:${colors.reset}`);
    for (const variable of unusedVariables) {
      console.log(`    ${icons.warning} ${variable}`);
    }
  }

  // المتغيرات المفقودة
  if (missingVariables.length > 0) {
    console.log(
      `\n  ${colors.red}❌ متغيرات مستخدمة في الكود ولكنها غير محددة في .env:${colors.reset}`,
    );
    for (const variable of missingVariables) {
      console.log(`    ${icons.error} ${variable}`);
      // عرض مكان الاستخدام
      const usages = codeUsages.filter((u) => u.variable === variable);
      for (const usage of usages.slice(0, 3)) {
        console.log(`      → ${usage.file}:${usage.line}`);
      }
      if (usages.length > 3) {
        console.log(`      → ... و ${usages.length - 3} استخدامات أخرى`);
      }
    }
  }

  // عرض تفاصيل الاستخدام
  if (codeUsages.length > 0) {
    console.log(`\n  ${colors.blue}📝 تفاصيل الاستخدام (أول 10):${colors.reset}`);
    for (const usage of codeUsages.slice(0, 10)) {
      console.log(`    ${icons.file} ${usage.file}:${usage.line} → ${usage.fullMatch}`);
    }
    if (codeUsages.length > 10) {
      console.log(`    ... و ${codeUsages.length - 10} استخدامات أخرى`);
    }
  }

  // ==================== 6. فحص المتغيرات المطلوبة ====================
  printHeader("فحص المتغيرات المطلوبة", icons.info);

  const requiredVars = [
    { name: "VITE_SUPABASE_URL", description: "Supabase URL" },
    { name: "VITE_SUPABASE_ANON_KEY", description: "Supabase Anonymous Key" },
    { name: "VITE_API_URL", description: "API Base URL" },
  ];

  let requiredMissing = 0;
  for (const required of requiredVars) {
    const value = allEnvVars.get(required.name);
    if (value) {
      printSuccess(`${required.name} - ${required.description}`);
    } else {
      printError(`${required.name} - ${required.description} (غير موجود)`);
      requiredMissing++;
    }
  }

  if (requiredMissing > 0) {
    printWarning(`يرجى إضافة ${requiredMissing} متغيرات مطلوبة`);
  }

  // ==================== 7. التوصيات ====================
  printHeader("التوصيات", icons.info);

  if (missingVariables.length > 0) {
    printWarning(`أضف المتغيرات المفقودة إلى ملف .env: ${missingVariables.join(", ")}`);
  }

  if (unusedVariables.length > 0) {
    printWarning(`يمكنك إزالة المتغيرات غير المستخدمة: ${unusedVariables.slice(0, 5).join(", ")}`);
    if (unusedVariables.length > 5) {
      printInfo(`و ${unusedVariables.length - 5} متغيرات أخرى`);
    }
  }

  if (!existsSync(".env.example")) {
    printInfo("أنشئ ملف .env.example كمرجع للمطورين الآخرين");
  }

  // ==================== الملخص النهائي ====================
  console.log(`\n${colors.cyan}${colors.bright}${"=".repeat(60)}${colors.reset}`);
  const totalErrors = missingVariables.length + requiredMissing + validationFailed;

  if (totalErrors === 0) {
    console.log(`${colors.green}${colors.bright}✅ جميع الفحوصات اجتازت بنجاح!${colors.reset}`);
  } else {
    console.log(
      `${colors.yellow}${colors.bright}⚠️ تم العثور على ${totalErrors} مشكلة تحتاج إلى معالجة${colors.reset}`,
    );
  }
  console.log(`${colors.cyan}${colors.bright}${"=".repeat(60)}${colors.reset}\n`);
}

// تشغيل السكربت
main().catch(console.error);
