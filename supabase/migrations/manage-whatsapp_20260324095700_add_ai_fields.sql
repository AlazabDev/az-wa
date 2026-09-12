-- إضافة حقل تحليل الذكاء الاصطناعي للمحادثات
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_ai_analysis JSONB;
