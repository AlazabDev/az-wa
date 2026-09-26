
-- Create media_folders table
CREATE TABLE IF NOT EXISTS public.media_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "folders_select" ON public.media_folders FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "folders_insert" ON public.media_folders FOR INSERT WITH CHECK (has_tenant_role(tenant_id, 'operator'::member_role));
CREATE POLICY "folders_update" ON public.media_folders FOR UPDATE USING (has_tenant_role(tenant_id, 'operator'::member_role));
CREATE POLICY "folders_delete" ON public.media_folders FOR DELETE USING (has_tenant_role(tenant_id, 'admin'::member_role));

-- Add folder_id to media_files
ALTER TABLE public.media_files ADD COLUMN folder_id UUID REFERENCES public.media_folders(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX idx_media_files_folder_id ON public.media_files(folder_id);
CREATE INDEX idx_media_folders_tenant_id ON public.media_folders(tenant_id);
