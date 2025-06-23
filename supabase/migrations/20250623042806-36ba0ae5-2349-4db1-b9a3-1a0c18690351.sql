
-- Create storage bucket for downloads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'downloads',
  'downloads',
  true,
  104857600, -- 100MB limit
  ARRAY['video/mp4', 'audio/mpeg', 'video/webm']
);

-- Create policy to allow public access to download files
CREATE POLICY "Public download access" ON storage.objects
  FOR SELECT USING (bucket_id = 'downloads');

-- Create policy to allow authenticated users to upload
CREATE POLICY "Authenticated users can upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'downloads' AND auth.role() = 'authenticated');

-- Add download_url column to download_jobs table
ALTER TABLE public.download_jobs 
ADD COLUMN download_url TEXT;

-- Enable realtime for the updated table
ALTER TABLE public.download_jobs REPLICA IDENTITY FULL;
