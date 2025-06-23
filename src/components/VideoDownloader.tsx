"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Play, Video, FileVideo, Loader2, CheckCircle, AlertCircle, Youtube, Music, Film, ExternalLink } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from '@/components/ui/card';
import { useDownloads } from '@/hooks/useDownloads';

interface VideoData {
  title: string;
  thumbnail: string;
  duration: string;
  uploader: string;
  view_count: string;
  formats?: any[];
}

interface DownloadJob {
  id: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number;
  video_title?: string;
  video_thumbnail?: string;
  video_uploader?: string;
  quality: string;
  download_speed: string;
  eta: string;
  file_size?: string;
  download_url?: string;
}

const FloatingShape = ({ 
  delay = 0, 
  className = "",
  size = 100,
  color = "from-red-500/20"
}: {
  delay?: number;
  className?: string;
  size?: number;
  color?: string;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0, rotate: 0 }}
      animate={{ 
        opacity: [0, 1, 1, 0],
        scale: [0, 1, 1.2, 0],
        rotate: [0, 180, 360],
        y: [0, -20, 0]
      }}
      transition={{
        duration: 8,
        delay,
        repeat: Infinity,
        ease: "easeInOut"
      }}
      className={cn(
        "absolute rounded-full blur-xl",
        `bg-gradient-to-r ${color} to-transparent`,
        className
      )}
      style={{ width: size, height: size }}
    />
  );
};

const GlowOrb = ({ 
  className = "",
  size = 200,
  color = "bg-gradient-to-r from-blue-500/30 to-purple-500/30"
}: {
  className?: string;
  size?: number;
  color?: string;
}) => {
  return (
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
      className={cn(
        "absolute rounded-full blur-3xl",
        color,
        className
      )}
      style={{ width: size, height: size }}
    />
  );
};

const ParticleField = () => {
  const particles = Array.from({ length: 20 }, (_, i) => i);
  
  return (
    <div className="absolute inset-0 overflow-hidden">
      {particles.map((i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-white/20 rounded-full"
          initial={{
            x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000),
            y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1000),
            opacity: 0
          }}
          animate={{
            y: [null, -100],
            opacity: [0, 1, 0]
          }}
          transition={{
            duration: Math.random() * 3 + 2,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: "linear"
          }}
        />
      ))}
    </div>
  );
};

const VideoDownloader = () => {
  const [url, setUrl] = useState('');
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [selectedQuality, setSelectedQuality] = useState('1080p');
  const [selectedFormat, setSelectedFormat] = useState<'video' | 'audio' | 'both'>('both');
  const [error, setError] = useState('');
  
  // Use the real useDownloads hook
  const { downloadJobs, isLoading, getVideoInfo, startDownload, downloadFile } = useDownloads();

  console.log('VideoDownloader component rendering');

  // Get current downloading job
  const currentDownload = downloadJobs.find(job => 
    job.status === 'downloading' || job.status === 'pending'
  );

  // Get completed downloads
  const completedDownloads = downloadJobs.filter(job => job.status === 'completed');

  // Detect platform from URL
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

    // Basic URL validation for supported platforms
    const supportedPlatforms = [
      'youtube.com', 'youtu.be', 'facebook.com', 'fb.watch',
      'twitter.com', 'x.com', 'instagram.com', 'tiktok.com'
    ];
    
    const isSupported = supportedPlatforms.some(platform => url.includes(platform));
    if (!isSupported) {
      setError('Please enter a URL from a supported platform');
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

  const handleDownload = async () => {
    if (!videoData) return;
    
    // Ensure formats array exists for VideoInfo interface compatibility
    const videoInfoWithFormats = {
      ...videoData,
      formats: videoData.formats || []
    };
    
    const qualityWithFormat = `${selectedQuality}_${selectedFormat}`;
    const jobId = await startDownload(url, videoInfoWithFormats, qualityWithFormat);
    if (jobId) {
      setVideoData(null);
      setUrl('');
    }
  };

  const qualityOptions = [
    { label: '144p', value: '144p' },
    { label: '360p', value: '360p' },
    { label: '720p', value: '720p' },
    { label: '1080p', value: '1080p' },
    { label: '1440p', value: '1440p' },
    { label: '4K', value: '4K' }
  ];

  const formatOptions = [
    { label: 'Video + Audio', value: 'both' as const, icon: Video },
    { label: 'Video Only', value: 'video' as const, icon: Film },
    { label: 'Audio Only', value: 'audio' as const, icon: Music }
  ];

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900" />
        
        {/* Floating Shapes */}
        <FloatingShape delay={0} className="top-20 left-20" size={150} color="from-red-500/20" />
        <FloatingShape delay={2} className="top-40 right-32" size={100} color="from-blue-500/20" />
        <FloatingShape delay={4} className="bottom-32 left-40" size={120} color="from-purple-500/20" />
        <FloatingShape delay={6} className="bottom-20 right-20" size={80} color="from-green-500/20" />
        
        {/* Glow Orbs */}
        <GlowOrb className="top-1/4 left-1/4" size={300} color="bg-gradient-to-r from-red-500/20 to-orange-500/20" />
        <GlowOrb className="bottom-1/4 right-1/4" size={250} color="bg-gradient-to-r from-blue-500/20 to-cyan-500/20" />
        
        {/* Particle Field */}
        <ParticleField />
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-6 py-20">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center gap-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full px-6 py-3 mb-8"
          >
            <Youtube className="w-6 h-6 text-red-500" />
            <span className="text-white/80 font-medium">Universal Video Downloader</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-6xl md:text-8xl font-bold mb-6 bg-gradient-to-r from-white via-gray-200 to-white/60 bg-clip-text text-transparent"
          >
            Download
          </motion.h1>
          
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="text-4xl md:text-6xl font-bold mb-8 bg-gradient-to-r from-[#FFD700] via-[#FFC107] to-[#FFA000] bg-clip-text text-transparent"
          >
            From Any Platform
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="text-xl text-white/60 max-w-2xl mx-auto leading-relaxed"
          >
            YouTube, Facebook, Twitter, Instagram, TikTok and 1000+ more platforms. 
            Choose video quality, audio-only, or video-only downloads.
          </motion.p>
        </motion.div>

        {/* Download Interface */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="max-w-4xl mx-auto space-y-8"
        >
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            {/* URL Input */}
            <form onSubmit={handleSubmit} className="mb-8">
              <div className="flex gap-4">
                <Input
                  type="url"
                  placeholder="Paste video URL from any supported platform..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 bg-black/50 border-white/20 text-white placeholder:text-white/40 h-14 text-lg rounded-xl focus:border-red-500 transition-colors"
                />
                <Button
                  type="submit"
                  disabled={!url || isLoading}
                  className="h-14 px-8 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Video className="w-5 h-5 mr-2" />
                      Analyze
                    </>
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
                    <div className="flex gap-6">
                      <img
                        src={videoData.thumbnail}
                        alt="Video thumbnail"
                        className="w-32 h-20 object-cover rounded-lg"
                      />
                      <div className="flex-1">
                        <h3 className="text-white font-semibold text-lg mb-2">{videoData.title}</h3>
                        <div className="flex items-center gap-4 text-white/60 mb-4">
                          <span>Duration: {videoData.duration}</span>
                          <span>By: {videoData.uploader}</span>
                        </div>
                        
                        {/* Format Selection */}
                        <div className="mb-4">
                          <span className="text-white/80 block mb-2">Download Format:</span>
                          <div className="flex gap-2">
                            {formatOptions.map((format) => (
                              <button
                                key={format.value}
                                onClick={() => setSelectedFormat(format.value)}
                                className={cn(
                                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors",
                                  selectedFormat === format.value
                                    ? "bg-blue-500 text-white"
                                    : "bg-white/10 text-white/70 hover:bg-white/20"
                                )}
                              >
                                <format.icon className="w-4 h-4" />
                                {format.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        {/* Quality Selection */}
                        <div>
                          <span className="text-white/80 block mb-2">Quality:</span>
                          <div className="flex gap-2 flex-wrap">
                            {qualityOptions.map((quality) => (
                              <button
                                key={quality.value}
                                onClick={() => setSelectedQuality(quality.value)}
                                className={cn(
                                  "px-3 py-1 rounded-lg text-sm transition-colors",
                                  selectedQuality === quality.value
                                    ? "bg-red-500 text-white"
                                    : "bg-white/10 text-white/70 hover:bg-white/20"
                                )}
                              >
                                {quality.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Download Section */}
            {videoData && !currentDownload && (
              <Button
                onClick={handleDownload}
                className="w-full h-16 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold text-lg rounded-xl transition-all duration-300 transform hover:scale-105"
              >
                <Download className="w-6 h-6 mr-3" />
                Download {selectedFormat === 'audio' ? 'Audio' : selectedFormat === 'video' ? 'Video' : 'Video + Audio'} ({selectedQuality})
              </Button>
            )}

            <AnimatePresence>
              {currentDownload && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-black/30 rounded-2xl p-6 border border-white/10"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-white font-semibold">
                      {currentDownload.status === 'completed' ? 'Download Complete!' : 'Downloading...'}
                    </span>
                    {currentDownload.status === 'completed' ? (
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    ) : (
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-3 mb-4">
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
                  
                  <div className="space-y-3">
                    <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${currentDownload.progress}%` }}
                        className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full"
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    
                    <div className="flex justify-between text-sm text-white/70">
                      <span>{currentDownload.progress.toFixed(1)}%</span>
                      <span>{currentDownload.download_speed}</span>
                      <span>ETA: {currentDownload.eta}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Completed Downloads */}
          {completedDownloads.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-white font-semibold text-xl mb-6">Ready for Download</h3>
              <div className="space-y-4">
                {completedDownloads.map((job) => (
                  <div key={job.id} className="bg-black/30 rounded-xl p-4 border border-white/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <img 
                          src={job.video_thumbnail || ''} 
                          alt={job.video_title || 'Video'}
                          className="w-12 h-9 object-cover rounded"
                        />
                        <div>
                          <h4 className="text-white font-medium text-sm truncate max-w-xs">
                            {job.video_title}
                          </h4>
                          <p className="text-gray-400 text-xs">
                            {job.file_size} • {job.quality}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => job.download_url && downloadFile(job.download_url, job.video_title || 'video')}
                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="grid md:grid-cols-4 gap-8 mt-20 max-w-6xl mx-auto"
        >
          {[
            { icon: Youtube, title: "1000+ Platforms", desc: "YouTube, Facebook, Twitter, Instagram, TikTok & more", color: "text-red-500" },
            { icon: FileVideo, title: "Multiple Formats", desc: "Video, Audio, or Both - You choose!", color: "text-blue-500" },
            { icon: Download, title: "Real-Time Downloads", desc: "No queues - Instant downloads", color: "text-green-500" },
            { icon: Play, title: "All Qualities", desc: "From 144p to 4K Ultra HD", color: "text-purple-500" }
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4 + i * 0.2, duration: 0.6 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center hover:bg-white/10 transition-colors"
            >
              <feature.icon className={cn("w-12 h-12 mx-auto mb-4", feature.color)} />
              <h3 className="text-white font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-white/60">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default VideoDownloader;
