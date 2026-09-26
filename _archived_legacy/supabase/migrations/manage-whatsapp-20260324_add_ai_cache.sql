-- جدول التخزين المؤقت لتحليل الصور
CREATE TABLE IF NOT EXISTS ai_analysis_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_hash VARCHAR(64) UNIQUE NOT NULL,
    analysis_result JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days'
);

-- فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_ai_cache_hash ON ai_analysis_cache(image_hash);
CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_analysis_cache(expires_at);

-- RLS سياسات
ALTER TABLE ai_analysis_cache ENABLE ROW LEVEL SECURITY;

-- فقط الخدمة يمكنها الوصول
CREATE POLICY "Service role can manage cache"
    ON ai_analysis_cache
    FOR ALL
    USING (auth.role() = 'service_role');