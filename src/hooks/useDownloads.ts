
import { useState } from 'react';
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

// Direct Supabase configuration
const SUPABASE_URL = "https://uemkfuedhbhhzowhpjgo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlbWtmdWVkaGJoaHpvd2hwamdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MTEwMzMsImV4cCI6MjA2NjE4NzAzM30.8x1JbbReKwnLBb0MuWnCaFGwEsWB0IPXMab0ehMf9ko";

export const useDownloads = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const checkDownloadHealth = async (): Promise<boolean> => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/download-video`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.status === 'healthy';
      }
      return false;
    } catch (error) {
      console.error('Health check error:', error);
      return false;
    }
  };

  const getVideoInfo = async (url: string): Promise<VideoInfo | null> => {
    setIsLoading(true);
    try {
      // For now, return mock video info since we're focusing on downloads
      // The actual video info will be extracted during download
      const mockInfo: VideoInfo = {
        title: "Video from " + new URL(url).hostname,
        thumbnail: "https://via.placeholder.com/320x180",
        duration: "Unknown",
        uploader: "Unknown",
        view_count: "Unknown",
        platform: new URL(url).hostname,
        available_qualities: ['144p', '360p', '720p', '1080p'],
        has_audio: true,
        has_video: true,
        fallback: true
      };

      toast({
        title: "✅ URL Validated",
        description: "Ready to download! Select your preferred format and quality.",
        duration: 3000,
      });

      return mockInfo;
    } catch (error) {
      console.error('Error validating URL:', error);
      toast({
        title: "❌ Invalid URL",
        description: "Please enter a valid video URL.",
        variant: "destructive",
        duration: 4000,
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
      // Convert quality format to mode
      const [resolution, format] = quality.split('_');
      let mode: 'video' | 'audio' | 'both' = 'both';
      
      if (format === 'audio') mode = 'audio';
      else if (format === 'video') mode = 'video';
      else mode = 'both';
      
      console.log(`Starting download with mode: ${mode}`);
      
      toast({
        title: "🚀 Starting Download",
        description: `Downloading ${mode === 'both' ? 'video+audio' : mode}. This may take a moment...`,
        duration: 4000,
      });

      const response = await fetch(`${SUPABASE_URL}/functions/v1/download-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ 
          url, 
          mode
        })
      });

      if (!response.ok) {
        let errorMessage = 'Download failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Check if response is file or error
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Download failed');
      }

      // Handle file download
      const blob = await response.blob();
      console.log('Download complete, blob size:', blob.size);

      if (blob.size < 1000) {
        throw new Error('Downloaded file is too small - likely corrupted');
      }

      // Extract filename from response headers
      const contentDisposition = response.headers.get('content-disposition');
      let fileName = 'downloaded_file';
      
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="([^"]+)"/);
        if (fileNameMatch) {
          fileName = fileNameMatch[1];
        }
      } else {
        // Generate filename based on mode
        const timestamp = new Date().toISOString().slice(0, 10);
        const extension = mode === 'audio' ? 'mp3' : 'mp4';
        fileName = `download_${timestamp}.${extension}`;
      }
      
      // Create and trigger download
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      setTimeout(() => {
        window.URL.revokeObjectURL(downloadUrl);
      }, 1000);

      toast({
        title: "✅ Download Complete!",
        description: `${fileName} (${formatFileSize(blob.size)}) has been downloaded successfully.`,
        duration: 6000,
      });
      
    } catch (error) {
      console.error('Download error:', error);
      
      let userMessage = "Please check the URL and try again.";
      const errorMsg = error.message || '';
      
      if (errorMsg.includes('timeout')) {
        userMessage = "Download timed out. Please try again.";
      } else if (errorMsg.includes('not available') || errorMsg.includes('No video file')) {
        userMessage = "This video is not available for download or the URL is invalid.";
      } else if (errorMsg.includes('too small') || errorMsg.includes('corrupted')) {
        userMessage = "Download failed due to file corruption. Please try again.";
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
