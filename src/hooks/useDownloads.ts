
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface DownloadJob {
  id: string;
  video_url: string;
  video_title: string | null;
  video_thumbnail: string | null;
  video_duration: string | null;
  video_uploader: string | null;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  download_speed: string | null;
  eta: string | null;
  quality: string;
  created_at: string;
  error_message: string | null;
  file_size?: string | null;
  download_url?: string | null;
}

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: string;
  uploader: string;
  view_count: string;
  formats: any[];
}

export const useDownloads = () => {
  const [downloadJobs, setDownloadJobs] = useState<DownloadJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Subscribe to realtime updates for download jobs
    const channel = supabase
      .channel('download-jobs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'download_jobs'
        },
        (payload) => {
          console.log('Download job update:', payload);
          
          if (payload.eventType === 'INSERT') {
            setDownloadJobs(prev => [...prev, payload.new as DownloadJob]);
          } else if (payload.eventType === 'UPDATE') {
            setDownloadJobs(prev => 
              prev.map(job => 
                job.id === payload.new.id ? payload.new as DownloadJob : job
              )
            );
            
            // Show download completion notification with download action
            const updatedJob = payload.new as DownloadJob;
            if (updatedJob.status === 'completed' && updatedJob.download_url) {
              toast({
                title: "Download Complete!",
                description: `${updatedJob.video_title || 'Your video'} is ready for download.`,
              });
            } else if (updatedJob.status === 'failed') {
              toast({
                title: "Download Failed",
                description: updatedJob.error_message || "An error occurred during download",
                variant: "destructive"
              });
            }
            
          } else if (payload.eventType === 'DELETE') {
            setDownloadJobs(prev => prev.filter(job => job.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Load existing download jobs
    loadDownloadJobs();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadDownloadJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('download_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      
      const typedData: DownloadJob[] = (data || []).map(job => ({
        ...job,
        status: job.status as DownloadJob['status']
      }));
      
      setDownloadJobs(typedData);
    } catch (error) {
      console.error('Error loading download jobs:', error);
    }
  };

  const getVideoInfo = async (url: string): Promise<VideoInfo | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-video-info', {
        body: { url }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting video info:', error);
      toast({
        title: "Error",
        description: "Failed to fetch video information. Please check the URL and try again.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const startDownload = async (url: string, videoInfo: VideoInfo, quality: string = '1080p_both') => {
    try {
      const { data: job, error: jobError } = await supabase
        .from('download_jobs')
        .insert({
          video_url: url,
          video_title: videoInfo.title,
          video_thumbnail: videoInfo.thumbnail,
          video_duration: videoInfo.duration,
          video_uploader: videoInfo.uploader,
          quality,
          status: 'pending'
        })
        .select()
        .single();

      if (jobError) throw jobError;

      const { error: downloadError } = await supabase.functions.invoke('download-video', {
        body: { 
          url, 
          quality, 
          jobId: job.id 
        }
      });

      if (downloadError) throw downloadError;

      toast({
        title: "Download Started",
        description: "Your video download has started. You'll be notified when it's ready.",
      });

      return job.id;
    } catch (error) {
      console.error('Error starting download:', error);
      toast({
        title: "Download Failed",
        description: "Failed to start video download. Please try again.",
        variant: "destructive"
      });
      return null;
    }
  };

  const downloadFile = async (downloadUrl: string, fileName: string) => {
    try {
      toast({
        title: "Download Starting",
        description: "Preparing your file for download...",
      });

      // Fetch the file from the signed URL
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      // Get the file as a blob
      const blob = await response.blob();
      
      // Determine file extension from quality/format or use mp4 as default
      const extension = fileName.includes('audio') ? 'mp3' : 'mp4';
      const sanitizedFileName = `${fileName.replace(/[^a-zA-Z0-9\s-]/g, '')}.${extension}`;
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create and trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = sanitizedFileName;
      
      // Add to DOM temporarily and click
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      toast({
        title: "Download Complete!",
        description: `${sanitizedFileName} has been downloaded to your device.`,
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Download Error",
        description: "Failed to download the file. The download link may have expired.",
        variant: "destructive"
      });
    }
  };

  return {
    downloadJobs,
    isLoading,
    getVideoInfo,
    startDownload,
    loadDownloadJobs,
    downloadFile
  };
};
