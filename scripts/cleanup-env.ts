#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "fs";

// قائمة المتغيرات المكررة مع تحديد المتغير الأساسي
const duplicatesMap: Record<string, string> = {
  META_TOKEN: "WA_ACCESS_TOKEN",
  META_BUSINESS_ID: "WA_BUSINESS_ID",
  BUSINESS_ID: "WA_BUSINESS_ID",
  META_APP_ID: "WA_APP_ID",
  META_APP_SECRET: "WA_APP_SECRET",
  WHATSAPP_VERIFY_TOKEN: "WA_WEBHOOK_VERIFY_TOKEN",
  META_API_VERSION: "WA_API_VERSION",
  META_GRAPH_API_BASE_URL: "API",
  WHATSAPP_BUSINESS_ACCOUNT_ID: "WA_PRIMARY_WABA_ID",
  WA_WABA_EG_ID: "WA_PRIMARY_WABA_ID",
  WHATSAPP_PHONE_NUMBER_ID: "WA_PHONE_NUMBER_ID",
  WA_PHONE_NUMBER_ID_EG: "WA_PHONE_NUMBER_ID",
  WHATSAPP_DISPLAY_NUMBER: "WA_DISPLAY_NUMBER",
  WA_DISPLAY_NUMBER_EG: "WA_DISPLAY_NUMBER",
  AI_VISION_ENABLED: "CHATBOT_ENABLED",
  SEAFILE_TOKEN: "SEAFILE_API_TOKEN",
  SEAFILE_WHATSAPP_REPO_ID: "SEAFILE_REPO_ID",
  SEAFILE_WHATSAPP_REPO_NAME: "SEAFILE_REPO_NAME",
};

// قراءة ملف .env الحالي
const envContent = readFileSync(".env", "utf-8");
const lines = envContent.split("\n");
const newLines: string[] = [];
const removedVars: string[] = [];

for (const line of lines) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
  if (match) {
    const varName = match[1];
    if (duplicatesMap[varName]) {
      removedVars.push(varName);
      console.log(`🗑️  سيتم إزالة: ${varName} (مكرر لـ ${duplicatesMap[varName]})`);
      continue; // تخطي إضافة هذا السطر
    }
  }
  newLines.push(line);
}

// حفظ الملف النظيف
writeFileSync(".env.clean", newLines.join("\n"));
console.log(`\n✅ تم إنشاء ملف .env.clean`);
console.log(`📊 تم إزالة ${removedVars.length} متغيراً مكرراً`);
console.log(`💡 قم بمراجعة الملف ثم استبدل .env الأصلي إذا كان مناسباً`);
