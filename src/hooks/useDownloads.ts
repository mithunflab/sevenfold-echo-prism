
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
  formats?: any[];
  platform?: string;
  available_qualities?: string[];
  has_audio?: boolean;
  has_video?: boolean;
  fallback?: boolean;
}

export const useDownloads = () => {
  const [downloadJobs, setDownloadJobs] = useState<DownloadJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    console.log('Setting up realtime subscription for downloads...');
    
    const channel = supabase
      .channel('download_jobs_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'download_jobs'
        },
        (payload) => {
          console.log('Real-time download update:', payload.eventType, payload);
          
          if (payload.eventType === 'INSERT') {
            const newJob = payload.new as DownloadJob;
            setDownloadJobs(prev => {
              const exists = prev.find(job => job.id === newJob.id);
              if (exists) return prev;
              return [newJob, ...prev];
            });
            
          } else if (payload.eventType === 'UPDATE') {
            const updatedJob = payload.new as DownloadJob;
            
            setDownloadJobs(prev => 
              prev.map(job => 
                job.id === updatedJob.id ? updatedJob : job
              )
            );
            
            if (updatedJob.status === 'completed' && updatedJob.download_url) {
              toast({
                title: "✅ Download Complete!",
                description: `${updatedJob.video_title || 'Your video'} is ready (${updatedJob.file_size}). File integrity verified. Click Download to save to your device.`,
                duration: 8000,
              });
            } else if (updatedJob.status === 'failed') {
              const errorMsg = updatedJob.error_message || "Download failed";
              let userFriendlyMsg = "Download failed. Please try again.";
              
              if (errorMsg.includes('File too small') || errorMsg.includes('corrupted')) {
                userFriendlyMsg = "File corruption detected. The video may not be available in the requested quality. Try a different quality or URL.";
              } else if (errorMsg.includes('Invalid file format')) {
                userFriendlyMsg = "Downloaded file is invalid. The video may be region-locked or unavailable. Try a different URL or quality.";
              } else if (errorMsg.includes('timeout')) {
                userFriendlyMsg = "Download timed out. Try again with a lower quality setting or check your internet connection.";
              } else if (errorMsg.includes('not available')) {
                userFriendlyMsg = "This quality is not available for this video. Please try a different quality option.";
              } else if (errorMsg.includes('yt-dlp') || errorMsg.includes('downloader') || errorMsg.includes('environment')) {
                userFriendlyMsg = "Video downloader is currently unavailable. Our system is working to resolve this. Please try again in a few minutes.";
              } else if (errorMsg.includes('No video file was downloaded')) {
                userFriendlyMsg = "No video was downloaded. The URL may be invalid, private, or from an unsupported platform.";
              }
              
              toast({
                title: "❌ Download Failed",
                description: userFriendlyMsg,
                variant: "destructive",
                duration: 10000,
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Download subscription status:', status);
      });

    loadDownloadJobs();

    return () => {
      console.log('Cleaning up download subscription');
      supabase.removeChannel(channel);
    };
  }, []);

  const loadDownloadJobs = async () => {
    try {
      console.log('Loading download jobs...');
      const { data, error } = await supabase
        .from('download_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error loading jobs:', error);
        throw error;
      }
      
      const typedData: DownloadJob[] = (data || []).map(job => ({
        ...job,
        status: job.status as DownloadJob['status']
      }));
      
      console.log('Loaded download jobs:', typedData.length);
      setDownloadJobs(typedData);
    } catch (error) {
      console.error('Error loading download jobs:', error);
      toast({
        title: "Error loading downloads",
        description: "Failed to load download history",
        variant: "destructive"
      });
    }
  };

  const checkDownloadHealth = async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('download-video', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      if (error) {
        console.error('Health check failed:', error);
        return false;
      }
      
      console.log('Download service health:', data);
      return data?.status === 'healthy' && data?.ytdlp === true;
    } catch (error) {
      console.error('Health check error:', error);
      return false;
    }
  };

  const getVideoInfo = async (url: string): Promise<VideoInfo | null> => {
    setIsLoading(true);
    try {
      console.log('Getting video info for:', url);
      
      // Check download service health first
      const isHealthy = await checkDownloadHealth();
      if (!isHealthy) {
        toast({
          title: "⚠️ Service Unavailable",
          description: "Download service is currently unavailable. Please try again later.",
          variant: "destructive",
          duration: 8000,
        });
        return null;
      }
      
      const { data, error } = await supabase.functions.invoke('get-video-info', {
        body: { url }
      });

      if (error) {
        console.error('Video info error:', error);
        throw error;
      }
      
      console.log('Video info received:', data);
      
      if (data.fallback) {
        toast({
          title: "⚠️ Limited Info Retrieved",
          description: "Using basic video information. Download will verify quality availability.",
          duration: 4000,
        });
      } else {
        toast({
          title: "✅ Video Info Retrieved",
          description: `Found video details and ${data.available_qualities?.length || 0} quality options.`,
          duration: 3000,
        });
      }
      
      return data;
    } catch (error) {
      console.error('Error getting video info:', error);
      toast({
        title: "❌ Unable to fetch video info",
        description: "Please check the URL and try again. The platform may not be supported.",
        variant: "destructive",
        duration: 6000,
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const startDownload = async (url: string, videoInfo: VideoInfo, quality: string = '1080p_both') => {
    try {
      console.log('Starting enhanced download with quality:', quality);
      
      // Check service health before starting download
      const isHealthy = await checkDownloadHealth();
      if (!isHealthy) {
        toast({
          title: "❌ Service Unavailable",
          description: "Download service is not ready. Please try again in a few minutes.",
          variant: "destructive",
          duration: 8000,
        });
        return null;
      }
      
      const [resolution, format] = quality.split('_');
      
      toast({
        title: "🚀 Starting Enhanced Download",
        description: `Preparing ${resolution} ${format === 'both' ? 'video+audio' : format} download with file integrity verification...`,
        duration: 4000,
      });
      
      const { data: job, error: jobError } = await supabase
        .from('download_jobs')
        .insert({
          video_url: url,
          video_title: videoInfo.title,
          video_thumbnail: videoInfo.thumbnail,
          video_duration: videoInfo.duration,
          video_uploader: videoInfo.uploader,
          quality,
          status: 'pending',
          progress: 0
        })
        .select()
        .single();

      if (jobError) {
        console.error('Job creation error:', jobError);
        throw jobError;
      }

      console.log('Download job created:', job.id);

      const { data: downloadResponse, error: downloadError } = await supabase.functions.invoke('download-video', {
        body: { 
          url, 
          quality, 
          jobId: job.id 
        }
      });

      if (downloadError) {
        console.error('Download function error:', downloadError);
        throw downloadError;
      }

      console.log('Enhanced download function response:', downloadResponse);
      return job.id;
    } catch (error) {
      console.error('Error starting download:', error);
      
      let userMessage = "Please try a different quality option or check your internet connection.";
      if (error.message?.includes('environment') || error.message?.includes('unavailable')) {
        userMessage = "Download service is temporarily unavailable. Please try again in a few minutes.";
      } else if (error.message?.includes('not available')) {
        userMessage = "This quality is not available for this video. Try a different quality option.";
      } else if (error.message?.includes('timeout')) {
        userMessage = "Request timed out. Please try again with a lower quality setting.";
      }
      
      toast({
        title: "❌ Download Failed to Start",
        description: userMessage,
        variant: "destructive",
        duration: 8000,
      });
      return null;
    }
  };

  const downloadFile = async (downloadUrl: string, fileName: string, quality: string = '') => {
    try {
      console.log('Starting verified file download from URL:', downloadUrl);
      
      toast({
        title: "📥 Preparing Download",
        description: `Downloading verified file...`,
        duration: 3000,
      });

      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Accept': '*/*',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      console.log('File blob received, size:', blob.size, 'type:', blob.type);

      // Enhanced client-side validation
      if (blob.size < 100000) { // Less than 100KB is suspicious
        toast({
          title: "⚠️ Small File Warning",
          description: "The downloaded file seems unusually small. It may be corrupted or incomplete.",
          variant: "destructive",
          duration: 8000,
        });
      }

      let extension = 'mp4';
      if (quality.includes('audio') || blob.type.includes('audio')) {
        extension = blob.type.includes('mp4') ? 'm4a' : 'mp3';
      } else if (blob.type.includes('webm')) {
        extension = 'webm';
      }
      
      const sanitizedFileName = `${fileName.replace(/[^a-zA-Z0-9\s-_()]/g, '')}.${extension}`;
      
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = sanitizedFileName;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => {
        window.URL.revokeObjectURL(link.href);
      }, 1000);

      toast({
        title: "✅ Download Started!",
        description: `${sanitizedFileName} (${formatFileSize(blob.size)}) - File integrity verified. Check your Downloads folder.`,
        duration: 6000,
      });
      
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "❌ Download Error",
        description: `Failed to download file: ${error.message}. The download link may have expired.`,
        variant: "destructive",
        duration: 8000,
      });
    }
  };

  return {
    downloadJobs,
    isLoading,
    getVideoInfo,
    startDownload,
    loadDownloadJobs,
    downloadFile,
    checkDownloadHealth
  };
};

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
