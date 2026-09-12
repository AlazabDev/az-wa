-- إضافة حقل تحليل الذكاء الاصطناعي للمحادثات
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_ai_analysis JSONB;

-- إضافة حقل تحليل الذكاء الاصطناعي لطلبات الصيانة
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS issue_type VARCHAR(50);
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS urgency VARCHAR(20);