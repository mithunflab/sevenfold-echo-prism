
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
    let reconnectTimer: NodeJS.Timeout;
    
    const setupRealtimeSubscription = () => {
      console.log('Setting up realtime subscription...');
      
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
            console.log('Real-time download job update:', payload);
            
            if (payload.eventType === 'INSERT') {
              const newJob = payload.new as DownloadJob;
              setDownloadJobs(prev => {
                // Avoid duplicates
                if (prev.find(job => job.id === newJob.id)) return prev;
                return [newJob, ...prev];
              });
              
            } else if (payload.eventType === 'UPDATE') {
              const updatedJob = payload.new as DownloadJob;
              
              setDownloadJobs(prev => 
                prev.map(job => 
                  job.id === updatedJob.id ? updatedJob : job
                )
              );
              
              // Enhanced completion notifications
              if (updatedJob.status === 'completed' && updatedJob.download_url) {
                const formatText = getFormatText(updatedJob.quality);
                toast({
                  title: "Download Complete! 🎉",
                  description: `${updatedJob.video_title || 'Your video'} (${formatText}) is ready for download.`,
                });
                
                // Optional: Auto-trigger download after a delay
                setTimeout(() => {
                  if (updatedJob.download_url) {
                    console.log('Auto-downloading completed file');
                  }
                }, 2000);
                
              } else if (updatedJob.status === 'failed') {
                toast({
                  title: "Download Failed ❌",
                  description: updatedJob.error_message || "An error occurred during download",
                  variant: "destructive"
                });
              } else if (updatedJob.status === 'downloading' && updatedJob.progress > 0) {
                // Show progress updates for significant milestones
                const progress = Math.round(updatedJob.progress);
                if (progress % 25 === 0 && progress > 0 && progress < 100) {
                  console.log(`Download progress: ${progress}%`);
                }
              }
              
            } else if (payload.eventType === 'DELETE') {
              setDownloadJobs(prev => prev.filter(job => job.id !== payload.old.id));
            }
          }
        )
        .subscribe((state) => {
          console.log('Subscription state:', state);
          
          if (state === 'SUBSCRIBED') {
            console.log('Successfully subscribed to real-time updates');
            if (reconnectTimer) {
              clearTimeout(reconnectTimer);
            }
          } else if (state === 'CLOSED') {
            console.log('Real-time connection closed, attempting to reconnect...');
            reconnectTimer = setTimeout(() => {
              setupRealtimeSubscription();
            }, 5000);
          }
        });

      return channel;
    };

    const channel = setupRealtimeSubscription();
    
    // Load existing download jobs
    loadDownloadJobs();

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
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

      if (error) throw error;
      
      const typedData: DownloadJob[] = (data || []).map(job => ({
        ...job,
        status: job.status as DownloadJob['status']
      }));
      
      console.log('Loaded download jobs:', typedData.length);
      setDownloadJobs(typedData);
    } catch (error) {
      console.error('Error loading download jobs:', error);
    }
  };

  const getVideoInfo = async (url: string): Promise<VideoInfo | null> => {
    setIsLoading(true);
    try {
      console.log('Getting video info for:', url);
      const { data, error } = await supabase.functions.invoke('get-video-info', {
        body: { url }
      });

      if (error) throw error;
      console.log('Video info received:', data);
      return data;
    } catch (error) {
      console.error('Error getting video info:', error);
      toast({
        title: "Unable to fetch video info",
        description: "Please check the URL and try again. Make sure the video is publicly accessible.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const startDownload = async (url: string, videoInfo: VideoInfo, quality: string = '1080p_both') => {
    try {
      console.log('Starting download with quality:', quality);
      
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

      if (jobError) throw jobError;

      console.log('Download job created:', job.id);

      const { error: downloadError } = await supabase.functions.invoke('download-video', {
        body: { 
          url, 
          quality, 
          jobId: job.id 
        }
      });

      if (downloadError) throw downloadError;

      const formatText = getFormatText(quality);
      toast({
        title: "Download Started 🚀",
        description: `${videoInfo.title} (${formatText}) download has begun. You'll be notified when it's ready.`,
      });

      return job.id;
    } catch (error) {
      console.error('Error starting download:', error);
      toast({
        title: "Download Failed to Start",
        description: "Please try again. If the problem persists, check your internet connection.",
        variant: "destructive"
      });
      return null;
    }
  };

  const downloadFile = async (downloadUrl: string, fileName: string, quality: string = '') => {
    try {
      console.log('Starting file download:', fileName);
      
      const formatText = getFormatText(quality);
      toast({
        title: "Preparing Download 📥",
        description: `Getting your ${formatText} file ready...`,
      });

      // Fetch the file from the signed URL
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      // Get the file as a blob
      const blob = await response.blob();
      
      // Determine file extension based on quality/format
      let extension = 'mp4';
      if (quality.includes('audio')) {
        extension = 'mp3';
      } else if (quality.includes('video')) {
        extension = 'mp4';
      }
      
      // Create a safe filename
      const sanitizedFileName = `${fileName.replace(/[^a-zA-Z0-9\s-_()]/g, '')}.${extension}`;
      
      // Create a blob URL and trigger download
      const blobUrl = window.URL.createObjectURL(blob);
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
        title: "Download Complete! ✅",
        description: `${sanitizedFileName} has been saved to your device.`,
      });
      
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Download Error",
        description: "The download link may have expired. Please try downloading the video again.",
        variant: "destructive"
      });
    }
  };

  // Helper function to get user-friendly format text
  const getFormatText = (quality: string): string => {
    if (quality.includes('audio')) return 'Audio Only (MP3)';
    if (quality.includes('video')) return 'Video Only (MP4)';
    return 'Video + Audio (MP4)';
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
