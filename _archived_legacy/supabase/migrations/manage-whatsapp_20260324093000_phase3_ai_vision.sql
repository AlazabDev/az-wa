-- Phase 3 — AI Vision + Extraction (production-ready)

-- 1) media_files: AI state for gallery and manual reprocessing
ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS wa_media_id text,
  ADD COLUMN IF NOT EXISTS ai_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_last_extraction_id uuid;

CREATE INDEX IF NOT EXISTS idx_media_files_wa_media_id
  ON public.media_files (wa_media_id)
  WHERE wa_media_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_files_ai_status
  ON public.media_files (tenant_id, ai_status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_files_ai_tags
  ON public.media_files USING gin (ai_tags);

-- 2) ai_extractions: richer structured output for production use
ALTER TABLE public.ai_extractions
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS input_mime text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS raw_response jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_extractions_media_created
  ON public.ai_extractions (media_file_id, created_at DESC)
  WHERE media_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_extractions_request_fingerprint
  ON public.ai_extractions (tenant_id, request_fingerprint)
  WHERE request_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_extractions_tags
  ON public.ai_extractions USING gin (tags);

-- 3) link latest extraction from media_files to ai_extractions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'media_files_ai_last_extraction_id_fkey'
  ) THEN
    ALTER TABLE public.media_files
      ADD CONSTRAINT media_files_ai_last_extraction_id_fkey
      FOREIGN KEY (ai_last_extraction_id)
      REFERENCES public.ai_extractions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4) normalize any legacy completed status values
UPDATE public.ai_extractions
SET status = 'completed'
WHERE status = 'done';
