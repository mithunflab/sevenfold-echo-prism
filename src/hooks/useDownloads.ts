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
  formats?: any[]; // Made optional to match VideoData
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
    console.log('Setting up enhanced realtime subscription...');
    
    // Subscribe to realtime updates with proper error handling
    const channel = supabase
      .channel('download_jobs_channel', {
        config: {
          broadcast: { self: false }
        }
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'download_jobs'
        },
        (payload) => {
          console.log('Real-time update received:', payload);
          
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
            
            // Show completion notification
            if (updatedJob.status === 'completed' && updatedJob.download_url) {
              toast({
                title: "Download Complete! 🎉",
                description: `${updatedJob.video_title || 'Your video'} is ready for download.`,
              });
            } else if (updatedJob.status === 'failed') {
              toast({
                title: "Download Failed ❌",
                description: updatedJob.error_message || "Download failed. Please try again.",
                variant: "destructive"
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully connected to real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Real-time subscription error');
          // Retry connection after 3 seconds
          setTimeout(() => {
            console.log('Retrying real-time connection...');
            channel.unsubscribe();
            // Will be handled by component remount or manual retry
          }, 3000);
        }
      });

    // Load initial data
    loadDownloadJobs();

    // Cleanup
    return () => {
      console.log('Cleaning up real-time subscription');
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

  const getVideoInfo = async (url: string): Promise<VideoInfo | null> => {
    setIsLoading(true);
    try {
      console.log('Getting enhanced video info for:', url);
      const { data, error } = await supabase.functions.invoke('get-video-info', {
        body: { url }
      });

      if (error) {
        console.error('Video info error:', error);
        throw error;
      }
      
      console.log('Enhanced video info received:', data);
      
      // Show format validation info to user
      if (data.fallback) {
        toast({
          title: "Using Basic Info 📋",
          description: "Real-time format detection unavailable. Quality selection will be validated during download.",
        });
      } else {
        toast({
          title: "Real Video Info Retrieved! ✅",
          description: `Found ${data.available_qualities?.length || 0} quality options. Format validation active.`,
        });
      }
      
      return data;
    } catch (error) {
      console.error('Error getting video info:', error);
      toast({
        title: "Unable to fetch video info",
        description: "Please check the URL and try again. The platform may not be supported.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const startDownload = async (url: string, videoInfo: VideoInfo, quality: string = '1080p_both') => {
    try {
      console.log('Starting enhanced download with quality:', quality);
      
      // Enhanced format validation warning
      const [resolution, format] = quality.split('_');
      
      toast({
        title: "Validating Format 🔍",
        description: `Checking if ${resolution} ${format === 'both' ? 'video+audio' : format} is available...`,
      });
      
      // Create job in database
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

      console.log('Enhanced download job created:', job.id);

      // Start download process with validation
      console.log('Calling enhanced download function...');
      const { data: downloadResponse, error: downloadError } = await supabase.functions.invoke('download-video', {
        body: { 
          url, 
          quality, 
          jobId: job.id 
        }
      });

      if (downloadError) {
        console.error('Download function error:', downloadError);
        
        // Enhanced error handling
        if (downloadError.message?.includes('not available')) {
          toast({
            title: "Quality Not Available ⚠️",
            description: `${resolution} quality not available. Try a different quality option.`,
            variant: "destructive"
          });
        } else {
          toast({
            title: "Download Failed to Start",
            description: downloadError.message || "Please try again with a different quality.",
            variant: "destructive"
          });
        }
        throw downloadError;
      }

      console.log('Enhanced download function response:', downloadResponse);

      toast({
        title: "Format Validated & Download Started! 🚀",
        description: `${videoInfo.title} download has begun with ${resolution} ${format === 'both' ? 'video+audio' : format} format.`,
      });

      return job.id;
    } catch (error) {
      console.error('Error starting enhanced download:', error);
      toast({
        title: "Download Failed to Start",
        description: error.message || "Format validation failed. Please try a different quality option.",
        variant: "destructive"
      });
      return null;
    }
  };

  const downloadFile = async (downloadUrl: string, fileName: string, quality: string = '') => {
    try {
      console.log('Starting file download:', fileName);
      
      toast({
        title: "Preparing Download 📥",
        description: `Getting your file ready...`,
      });

      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      const blob = await response.blob();
      
      // Determine file extension based on format
      let extension = 'mp4';
      if (quality.includes('audio')) {
        extension = 'mp3';
      }
      
      const sanitizedFileName = `${fileName.replace(/[^a-zA-Z0-9\s-_()]/g, '')}.${extension}`;
      
      // Create download link
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = sanitizedFileName;
      
      document.body.appendChild(link);
      link.click();
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
        description: "Failed to download file. Please try again.",
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
