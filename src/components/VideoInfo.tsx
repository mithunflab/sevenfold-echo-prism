
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Download, Eye, User, Clock } from 'lucide-react';

interface VideoData {
  title: string;
  thumbnail: string;
  duration: string;
  uploader: string;
  view_count: string;
}

interface VideoInfoProps {
  videoData: VideoData;
  onDownload: () => void;
  isDownloading: boolean;
}

const VideoInfo: React.FC<VideoInfoProps> = ({ videoData, onDownload, isDownloading }) => {
  return (
    <Card className="p-6 bg-gray-800/50 border-gray-700 backdrop-blur-sm animate-fade-in">
      <div className="grid md:grid-cols-3 gap-6">
        {/* Thumbnail */}
        <div className="relative group">
          <img 
            src={videoData.thumbnail} 
            alt={videoData.title}
            className="w-full h-48 object-cover rounded-lg transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/20 rounded-lg group-hover:bg-black/10 transition-colors duration-300"></div>
        </div>
        
        {/* Video Details */}
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-2xl font-bold text-white leading-tight">
            {videoData.title}
          </h2>
          
          <div className="flex flex-wrap gap-4 text-gray-400">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4" />
              <span>{videoData.uploader}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Eye className="w-4 h-4" />
              <span>{videoData.view_count}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4" />
              <span>{videoData.duration}</span>
            </div>
          </div>
          
          {/* Download Options */}
          <div className="space-y-3">
            <h3 className="text-white font-semibold">Quality Options</h3>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={onDownload}
                disabled={isDownloading}
                variant="outline"
                className="bg-gray-700/50 border-gray-600 text-white hover:bg-gray-600/50"
              >
                720p MP4
              </Button>
              <Button
                onClick={onDownload}
                disabled={isDownloading}
                variant="outline"
                className="bg-gray-700/50 border-gray-600 text-white hover:bg-gray-600/50"
              >
                1080p MP4
              </Button>
            </div>
            
            <Button
              onClick={onDownload}
              disabled={isDownloading}
              className="w-full h-12 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-semibold"
            >
              {isDownloading ? (
                <>
                  <Download className="w-5 h-5 mr-2 animate-bounce" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Download Best Quality
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default VideoInfo;
