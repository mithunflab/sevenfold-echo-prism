
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

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
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

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

  const startDirectDownload = async (url: string, videoInfo: VideoInfo, quality: string = '1080p_both') => {
    if (isDownloading) {
      toast({
        title: "⚠️ Download in Progress",
        description: "Please wait for the current download to complete.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsDownloading(true);
    
    try {
      console.log('Starting direct download with quality:', quality);
      
      // Check service health before starting download
      const isHealthy = await checkDownloadHealth();
      if (!isHealthy) {
        toast({
          title: "❌ Service Unavailable",
          description: "Download service is not ready. Please try again in a few minutes.",
          variant: "destructive",
          duration: 8000,
        });
        return;
      }
      
      const [resolution, format] = quality.split('_');
      
      toast({
        title: "🚀 Starting Direct Download",
        description: `Preparing ${resolution} ${format === 'both' ? 'video+audio' : format} download. This may take a moment...`,
        duration: 4000,
      });

      // Make direct download request
      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/download-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.supabaseKey}`,
        },
        body: JSON.stringify({ 
          url, 
          quality
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Download failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Check if response is JSON (error) or file stream (success)
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Download failed');
      }

      // Handle file download
      const blob = await response.blob();
      console.log('File blob received, size:', blob.size, 'type:', blob.type);

      // Validate downloaded file
      if (blob.size < 1000) {
        throw new Error('Downloaded file is too small - likely corrupted or invalid');
      }

      // Get filename from response headers or generate one
      const contentDisposition = response.headers.get('content-disposition');
      let fileName = 'downloaded_video';
      
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="([^"]+)"/);
        if (fileNameMatch) {
          fileName = fileNameMatch[1];
        }
      } else {
        // Generate filename based on quality and format
        const timestamp = new Date().toISOString().slice(0, 10);
        const extension = format === 'audio' ? 'mp3' : 'mp4';
        fileName = `${videoInfo.title.replace(/[^a-zA-Z0-9\s-_()]/g, '').slice(0, 50)}_${timestamp}.${extension}`;
      }
      
      // Create download link and trigger download
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up object URL
      setTimeout(() => {
        window.URL.revokeObjectURL(downloadUrl);
      }, 1000);

      toast({
        title: "✅ Download Complete!",
        description: `${fileName} (${formatFileSize(blob.size)}) has been downloaded successfully. Check your Downloads folder.`,
        duration: 6000,
      });
      
    } catch (error) {
      console.error('Error during direct download:', error);
      
      let userMessage = "Please try a different quality option or check your internet connection.";
      const errorMsg = error.message || '';
      
      if (errorMsg.includes('environment') || errorMsg.includes('unavailable')) {
        userMessage = "Download service is temporarily unavailable. Please try again in a few minutes.";
      } else if (errorMsg.includes('not available') || errorMsg.includes('No video file')) {
        userMessage = "This video is not available for download. The URL may be invalid, private, or from an unsupported platform.";
      } else if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
        userMessage = "Download timed out. Please try again with a lower quality setting.";
      } else if (errorMsg.includes('too small') || errorMsg.includes('corrupted')) {
        userMessage = "Download failed due to file corruption. Try a different quality or URL.";
      }
      
      toast({
        title: "❌ Download Failed",
        description: userMessage,
        variant: "destructive",
        duration: 8000,
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return {
    isLoading,
    isDownloading,
    getVideoInfo,
    startDirectDownload,
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
