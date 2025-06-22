
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Download, Play, Clock, FileVideo, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import ProgressBar from './ProgressBar';
import VideoInfo from './VideoInfo';
import DownloadHistory from './DownloadHistory';
import { useDownloads } from '@/hooks/useDownloads';

interface VideoData {
  title: string;
  thumbnail: string;
  duration: string;
  uploader: string;
  view_count: string;
  formats?: any[];
}

const VideoDownloader = () => {
  const [url, setUrl] = useState('');
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const { downloadJobs, isLoading, getVideoInfo, startDownload } = useDownloads();

  // Get current downloading job
  const currentDownload = downloadJobs.find(job => 
    job.status === 'downloading' || job.status === 'pending'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid YouTube URL.",
        variant: "destructive"
      });
      return;
    }

    const videoInfo = await getVideoInfo(url);
    if (videoInfo) {
      // Add formats property to match VideoData interface
      setVideoData({
        ...videoInfo,
        formats: videoInfo.formats || []
      });
      toast({
        title: "Video Found!",
        description: "Video information loaded successfully.",
      });
    }
  };

  const handleDownload = async (quality: string = '1080p') => {
    if (!videoData) return;
    
    // Convert VideoData to VideoInfo by ensuring formats is present
    const videoInfo = {
      ...videoData,
      formats: videoData.formats || []
    };
    
    const jobId = await startDownload(url, videoInfo, quality);
    if (jobId) {
      // Clear the current video data since download started
      setVideoData(null);
      setUrl('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* URL Input Section */}
      <Card className="p-8 bg-gray-800/50 border-gray-700 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-white font-medium text-lg">YouTube Video URL</label>
            <div className="flex gap-4">
              <Input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 bg-gray-900/50 border-gray-600 text-white placeholder-gray-400 h-12 text-lg"
                disabled={isLoading || !!currentDownload}
              />
              <Button 
                type="submit" 
                disabled={!url || isLoading || !!currentDownload}
                className="h-12 px-8 bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-700 hover:to-purple-700 text-white font-semibold"
              >
                {isLoading ? (
                  <>
                    <Clock className="w-5 h-5 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 mr-2" />
                    Get Video
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Video Information */}
      {videoData && (
        <VideoInfo 
          videoData={videoData} 
          onDownload={handleDownload}
          isDownloading={!!currentDownload}
        />
      )}

      {/* Current Download Progress */}
      {currentDownload && (
        <Card className="p-6 bg-gray-800/50 border-gray-700 backdrop-blur-sm">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-lg flex items-center">
                <Download className="w-5 h-5 mr-2 text-green-400" />
                {currentDownload.status === 'pending' ? 'Preparing Download...' : 'Downloading Video...'}
              </h3>
              <div className="text-right text-sm text-gray-400">
                {currentDownload.download_speed && <div>Speed: {currentDownload.download_speed}</div>}
                {currentDownload.eta && <div>ETA: {currentDownload.eta}</div>}
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <img 
                  src={currentDownload.video_thumbnail || ''} 
                  alt={currentDownload.video_title || 'Video'}
                  className="w-16 h-12 object-cover rounded"
                />
                <div className="flex-1">
                  <h4 className="text-white font-medium text-sm truncate">
                    {currentDownload.video_title}
                  </h4>
                  <p className="text-gray-400 text-xs">
                    {currentDownload.video_uploader} • {currentDownload.quality}
                  </p>
                </div>
              </div>
              
              <ProgressBar progress={currentDownload.progress} />
              
              <div className="flex justify-between text-sm text-gray-400">
                <span>{currentDownload.progress.toFixed(1)}% complete</span>
                <span className="flex items-center">
                  <FileVideo className="w-4 h-4 mr-1" />
                  MP4 Format • {currentDownload.quality}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Download History */}
      <DownloadHistory jobs={downloadJobs} />

      {/* Features Info */}
      <div className="grid md:grid-cols-3 gap-6 mt-12">
        <Card className="p-6 bg-gray-800/30 border-gray-700 backdrop-blur-sm">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
              <Download className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-white font-semibold">High Quality</h3>
            <p className="text-gray-400 text-sm">Download videos in up to 4K resolution with crystal clear audio quality.</p>
          </div>
        </Card>
        
        <Card className="p-6 bg-gray-800/30 border-gray-700 backdrop-blur-sm">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-600 rounded-full flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-white font-semibold">Real-Time Progress</h3>
            <p className="text-gray-400 text-sm">Track download progress with live speed and ETA updates.</p>
          </div>
        </Card>
        
        <Card className="p-6 bg-gray-800/30 border-gray-700 backdrop-blur-sm">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center mx-auto">
              <FileVideo className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-white font-semibold">Multiple Formats</h3>
            <p className="text-gray-400 text-sm">Support for various video formats and quality options.</p>
          </div>
        </Card>
      </div>

      {/* Disclaimer */}
      <Card className="p-4 bg-yellow-900/20 border-yellow-700/50 backdrop-blur-sm">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-yellow-200">
            <p className="font-medium mb-1">Important Notice</p>
            <p>This application uses yt-dlp to download videos. Please respect YouTube's Terms of Service and copyright laws when downloading content. Only download videos you have permission to download.</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default VideoDownloader;
