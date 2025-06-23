
-- Create storage bucket for downloads with proper configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'downloads',
  'downloads',
  true,
  524288000, -- 500MB limit (increased from 100MB)
  ARRAY['video/mp4', 'audio/mpeg', 'video/webm', 'audio/mp4', 'video/x-msvideo']
) ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['video/mp4', 'audio/mpeg', 'video/webm', 'audio/mp4', 'video/x-msvideo'];

-- Create comprehensive policies for download access
DROP POLICY IF EXISTS "Public download access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;

-- Allow public access to download files
CREATE POLICY "Public download access" ON storage.objects
  FOR SELECT USING (bucket_id = 'downloads');

-- Allow service role to upload files (for Edge Function)
CREATE POLICY "Service role can upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'downloads');

-- Allow service role to manage files
CREATE POLICY "Service role can manage" ON storage.objects
  FOR ALL USING (bucket_id = 'downloads');

-- Add download_url column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'download_jobs' AND column_name = 'download_url') THEN
        ALTER TABLE public.download_jobs ADD COLUMN download_url TEXT;
    END IF;
END $$;

-- Enable realtime for the updated table
ALTER TABLE public.download_jobs REPLICA IDENTITY FULL;

-- Grant necessary permissions
GRANT ALL ON storage.objects TO service_role;
GRANT ALL ON storage.buckets TO service_role;
