
-- Create table to store download jobs and their progress
CREATE TABLE public.download_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  video_url TEXT NOT NULL,
  video_title TEXT,
  video_thumbnail TEXT,
  video_duration TEXT,
  video_uploader TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'downloading', 'completed', 'failed', 'cancelled')),
  progress DECIMAL DEFAULT 0,
  download_speed TEXT,
  eta TEXT,
  file_size TEXT,
  quality TEXT DEFAULT '1080p',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  error_message TEXT
);

-- Enable Row Level Security
ALTER TABLE public.download_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for download jobs
CREATE POLICY "Users can view their own download jobs" 
  ON public.download_jobs 
  FOR SELECT 
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can create download jobs" 
  ON public.download_jobs 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update their own download jobs" 
  ON public.download_jobs 
  FOR UPDATE 
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Enable realtime for download_jobs table
ALTER TABLE public.download_jobs REPLICA IDENTITY FULL;

-- Add table to publication for realtime updates
ALTER publication supabase_realtime ADD TABLE public.download_jobs;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_download_jobs_updated_at 
    BEFORE UPDATE ON public.download_jobs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
