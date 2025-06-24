
"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Loader2, CheckCircle, AlertCircle, Youtube, Music, Film } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [selectedMode, setSelectedMode] = useState<'both' | 'video' | 'audio'>('both');
  const [error, setError] = useState('');
  
  const { isLoading, isDownloading, getVideoInfo, startDirectDownload } = useDownloads();

  const detectPlatform = (url: string) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
    if (url.includes('facebook.com') || url.includes('fb.watch')) return 'Facebook';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'Twitter/X';
    if (url.includes('instagram.com')) return 'Instagram';
    if (url.includes('tiktok.com')) return 'TikTok';
    return 'Supported Platform';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted with URL:', url);
    
    if (!url.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    try {
      new URL(url); // Validate URL format
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setError('');
    const videoInfo = await getVideoInfo(url);
    if (videoInfo) {
      setVideoData({
        ...videoInfo,
        formats: videoInfo.formats || []
      });
    }
  };

  const handleDirectDownload = async () => {
    if (!videoData) return;
    
    console.log('Starting download with mode:', selectedMode);
    
    // Convert mode to quality format expected by the download function
    const qualityWithFormat = `1080p_${selectedMode}`;
    await startDirectDownload(url, videoData, qualityWithFormat);
  };

  const formatOptions = [
    { 
      label: '🎞️ Video + Audio (Best)', 
      value: 'both' as const, 
      icon: Film, 
      desc: 'Complete video with sound (MP4)',
      recommended: true
    },
    { 
      label: '📽️ Video Only (Best)', 
      value: 'video' as const, 
      icon: Film, 
      desc: 'Video without audio track (MP4)',
      recommended: false
    },
    { 
      label: '🔊 Audio Only (MP3)', 
      value: 'audio' as const, 
      icon: Music, 
      desc: 'Extract audio track only (MP3)',
      recommended: false
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 relative">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-full blur-3xl"
        />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-6 py-20">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center gap-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full px-6 py-3 mb-8"
          >
            <Youtube className="w-6 h-6 text-red-500" />
            <span className="text-white/80 font-medium">YouTube Downloader with Format Options</span>
          </motion.div>

          <h1 className="text-6xl md:text-8xl font-bold mb-6 bg-gradient-to-r from-white via-gray-200 to-white/60 bg-clip-text text-transparent">
            🎥 Download
          </h1>
          
          <h2 className="text-4xl md:text-6xl font-bold mb-8 bg-gradient-to-r from-[#00c6ff] via-[#0072ff] to-[#00c6ff] bg-clip-text text-transparent">
            Any Video
          </h2>

          <p className="text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
            Paste a YouTube URL and choose what to download: Video + Audio, Video Only, or Audio Only (MP3)
          </p>
        </motion.div>

        {/* Download Interface */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="max-w-4xl mx-auto"
        >
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            {/* URL Input */}
            <form onSubmit={handleSubmit} className="mb-8">
              <div className="flex gap-4">
                <Input
                  type="url"
                  placeholder="e.g. https://youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 bg-black/50 border-white/20 text-white placeholder:text-white/40 h-14 text-lg rounded-xl focus:border-blue-500 transition-colors"
                />
                <Button
                  type="submit"
                  disabled={!url || isLoading}
                  className="h-14 px-8 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold rounded-xl transition-all duration-300"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Analyze'
                  )}
                </Button>
              </div>
              
              {url && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 text-center"
                >
                  <span className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 text-white/80">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    Platform detected: {detectPlatform(url)}
                  </span>
                </motion.div>
              )}
              
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 mt-4 text-red-400"
                >
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </motion.div>
              )}
            </form>

            <AnimatePresence>
              {videoData && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-8"
                >
                  <div className="bg-black/30 rounded-2xl p-6 border border-white/10">
                    <div className="flex gap-6 mb-6">
                      <img
                        src={videoData.thumbnail}
                        alt="Video thumbnail"
                        className="w-32 h-20 object-cover rounded-lg"
                      />
                      <div className="flex-1">
                        <h3 className="text-white font-semibold text-lg mb-2">{videoData.title}</h3>
                        <div className="flex items-center gap-4 text-white/60">
                          <span>Platform: {detectPlatform(url)}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Format Selection */}
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-white/80 font-medium">Choose Download Format:</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {formatOptions.map((format) => (
                          <button
                            key={format.value}
                            onClick={() => setSelectedMode(format.value)}
                            className={cn(
                              "flex flex-col items-center gap-3 p-4 rounded-xl text-sm transition-all relative",
                              selectedMode === format.value
                                ? "bg-blue-500/20 border-2 border-blue-400 text-white"
                                : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
                            )}
                          >
                            {format.recommended && selectedMode === format.value && (
                              <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                                Recommended
                              </span>
                            )}
                            <format.icon className="w-6 h-6" />
                            <span className="font-medium">{format.label}</span>
                            <span className="text-xs text-center opacity-75">{format.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Download Button */}
            {videoData && (
              <Button
                onClick={handleDirectDownload}
                disabled={isDownloading}
                className="w-full h-16 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold text-lg rounded-xl transition-all duration-300 transform hover:scale-105"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                    Downloading... Please wait
                  </>
                ) : (
                  <>
                    <Download className="w-6 h-6 mr-3" />
                    Download {formatOptions.find(f => f.value === selectedMode)?.label}
                  </>
                )}
              </Button>
            )}

            {/* Download Status */}
            {isDownloading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 bg-blue-500/10 border border-blue-400/20 rounded-xl p-4 text-center"
              >
                <div className="flex items-center justify-center gap-2 text-blue-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium">⏳ Downloading... please wait</span>
                </div>
                <p className="text-white/60 text-sm mt-2">
                  Your file will download automatically when ready. Please don't close this page.
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default VideoDownloader;
