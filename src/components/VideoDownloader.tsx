"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Play, Video, FileVideo, Loader2, CheckCircle, AlertCircle, Youtube, Music, Film, ExternalLink, Shield, Clock, User, Eye } from 'lucide-react';
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
  
  // Use the enhanced useDownloads hook
  const { downloadJobs, isLoading, getVideoInfo, startDownload, downloadFile } = useDownloads();

  console.log('VideoDownloader rendering, downloadJobs:', downloadJobs.length);

  // Get current downloading job
  const currentDownload = downloadJobs.find(job => 
    job.status === 'downloading' || job.status === 'pending'
  );

  // Get completed downloads (show last 5)
  const completedDownloads = downloadJobs
    .filter(job => job.status === 'completed' && job.download_url)
    .slice(0, 5);

  // Get failed downloads for debugging
  const failedDownloads = downloadJobs
    .filter(job => job.status === 'failed')
    .slice(0, 2);

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

    // Enhanced URL validation
    const supportedPlatforms = [
      'youtube.com', 'youtu.be', 'facebook.com', 'fb.watch',
      'twitter.com', 'x.com', 'instagram.com', 'tiktok.com',
      'dailymotion.com', 'vimeo.com', 'twitch.tv'
    ];
    
    const isSupported = supportedPlatforms.some(platform => url.includes(platform));
    if (!isSupported) {
      setError('Please enter a URL from a supported platform (YouTube, Facebook, Twitter, Instagram, TikTok, etc.)');
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
    
    console.log('Starting download with format:', selectedFormat, 'quality:', selectedQuality);
    
    const qualityWithFormat = `${selectedQuality}_${selectedFormat}`;
    const jobId = await startDownload(url, videoData, qualityWithFormat);
    if (jobId) {
      setVideoData(null);
      setUrl('');
      setError('');
    }
  };

  const qualityOptions = [
    { label: '144p', value: '144p', desc: 'Lowest quality, smallest file', size: '~5-15MB' },
    { label: '360p', value: '360p', desc: 'Good for mobile viewing', size: '~15-50MB' },
    { label: '720p', value: '720p', desc: 'HD quality, balanced size', size: '~50-200MB' },
    { label: '1080p', value: '1080p', desc: 'Full HD, recommended', size: '~200-500MB' },
    { label: '1440p', value: '1440p', desc: '2K quality, large file', size: '~500MB-1GB' },
    { label: '4K', value: '4K', desc: 'Ultra HD, very large file', size: '~1-3GB' }
  ];

  const formatOptions = [
    { 
      label: 'Video + Audio', 
      value: 'both' as const, 
      icon: Video, 
      desc: 'Complete video with sound (MP4)',
      recommended: true,
      detail: 'Best choice for watching'
    },
    { 
      label: 'Audio Only', 
      value: 'audio' as const, 
      icon: Music, 
      desc: 'Extract audio track only (MP3)',
      recommended: false,
      detail: 'Music, podcasts, lectures'
    },
    { 
      label: 'Video Only', 
      value: 'video' as const, 
      icon: Film, 
      desc: 'Video without audio track (MP4)',
      recommended: false,
      detail: 'Silent clips, GIFs'
    }
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

        {/* Enhanced Download Interface */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="max-w-4xl mx-auto space-y-8"
        >
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            {/* Enhanced URL Input with validation status */}
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
                      <Shield className="w-5 h-5 mr-2" />
                      Validate & Analyze
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
                          {(videoData as any).platform && (
                            <span className="bg-blue-500/20 px-2 py-1 rounded text-xs">
                              {(videoData as any).platform}
                            </span>
                          )}
                        </div>
                        
                        {/* Enhanced Format Selection with validation info */}
                        <div className="mb-6">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-white/80 font-medium">Download Format:</span>
                            {!(videoData as any).fallback && (
                              <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Validated
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {formatOptions.map((format) => (
                              <button
                                key={format.value}
                                onClick={() => setSelectedFormat(format.value)}
                                className={cn(
                                  "flex flex-col items-center gap-2 p-4 rounded-xl text-sm transition-all relative",
                                  selectedFormat === format.value
                                    ? "bg-blue-500/20 border-2 border-blue-400 text-white"
                                    : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
                                )}
                              >
                                {format.recommended && (
                                  <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                                    Recommended
                                  </span>
                                )}
                                <format.icon className="w-6 h-6" />
                                <span className="font-medium">{format.label}</span>
                                <span className="text-xs text-center opacity-75">{format.desc}</span>
                                <span className="text-xs text-blue-400">{format.detail}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        {/* Enhanced Quality Selection with size estimates */}
                        <div>
                          <span className="text-white/80 block mb-3 font-medium">
                            Quality {selectedFormat === 'audio' ? '(Audio Bitrate)' : '(Video Resolution)'}:
                          </span>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {qualityOptions.map((quality) => (
                              <button
                                key={quality.value}
                                onClick={() => setSelectedQuality(quality.value)}
                                className={cn(
                                  "flex flex-col items-center p-3 rounded-lg text-sm transition-colors",
                                  selectedQuality === quality.value
                                    ? "bg-red-500/20 border border-red-400 text-white"
                                    : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
                                )}
                              >
                                <span className="font-medium">{quality.label}</span>
                                <span className="text-xs opacity-75 text-center">{quality.desc}</span>
                                <span className="text-xs text-orange-400">{quality.size}</span>
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

            {/* Enhanced Download Button with validation status */}
            {videoData && !currentDownload && (
              <Button
                onClick={handleDownload}
                className="w-full h-16 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold text-lg rounded-xl transition-all duration-300 transform hover:scale-105 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/10 transform skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <Download className="w-6 h-6 mr-3" />
                Download {selectedFormat === 'audio' ? 'Audio' : selectedFormat === 'video' ? 'Video' : 'Video + Audio'} ({selectedQuality})
              </Button>
            )}

            {/* Enhanced Real-time Progress Display */}
            <AnimatePresence>
              {currentDownload && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl p-6 border border-blue-400/20"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                        <div className="absolute inset-0 bg-blue-400/20 rounded-full animate-ping"></div>
                      </div>
                      <span className="text-white font-semibold text-lg">
                        {currentDownload.status === 'pending' ? 'Preparing Download...' : 'Downloading'}
                      </span>
                    </div>
                    <span className="text-blue-400 font-bold text-xl">
                      {currentDownload.progress?.toFixed(1) || 0}%
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-4 mb-6">
                    {currentDownload.video_thumbnail && (
                      <img 
                        src={currentDownload.video_thumbnail} 
                        alt={currentDownload.video_title || 'Video'}
                        className="w-20 h-14 object-cover rounded-lg"
                      />
                    )}
                    <div className="flex-1">
                      <h4 className="text-white font-medium text-lg mb-1 truncate">
                        {currentDownload.video_title || 'Processing video...'}
                      </h4>
                      <p className="text-gray-300 text-sm mb-2">
                        {currentDownload.video_uploader && `${currentDownload.video_uploader} • `}
                        {formatOptions.find(f => currentDownload.quality?.includes(f.value))?.label || 'Processing'}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-white/70">
                        <span>{currentDownload.download_speed || 'Initializing...'}</span>
                        <span>•</span>
                        <span>{currentDownload.eta || 'Calculating...'}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Enhanced Progress Bar */}
                  <div className="space-y-2">
                    <div className="w-full bg-black/30 rounded-full h-4 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${currentDownload.progress || 0}%` }}
                        className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 rounded-full relative"
                        transition={{ duration: 0.5, ease: "easeOut" }}
                      >
                        <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full"></div>
                      </motion.div>
                    </div>
                    <div className="text-center text-sm text-white/60">
                      Download in progress - Your file will be ready soon!
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Failed Downloads Debug Info */}
            {failedDownloads.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <h4 className="text-red-400 font-medium mb-2">Recent Failed Downloads:</h4>
                {failedDownloads.map((job) => (
                  <div key={job.id} className="text-sm text-red-300 mb-1">
                    {job.video_title}: {job.error_message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Enhanced Completed Downloads */}
          {completedDownloads.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-white font-semibold text-2xl mb-6 flex items-center gap-2">
                <CheckCircle className="w-6 h-6 text-green-400" />
                Ready for Download ({completedDownloads.length})
              </h3>
              <div className="grid gap-4">
                {completedDownloads.map((job) => (
                  <div key={job.id} className="bg-black/20 rounded-xl p-4 border border-green-400/20 hover:border-green-400/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {job.video_thumbnail && (
                          <img 
                            src={job.video_thumbnail} 
                            alt={job.video_title || 'Video'}
                            className="w-16 h-12 object-cover rounded-lg"
                          />
                        )}
                        <div className="flex-1">
                          <h4 className="text-white font-medium text-lg mb-1 truncate max-w-xs">
                            {job.video_title || 'Downloaded Video'}
                          </h4>
                          <div className="flex items-center gap-3 text-sm text-gray-300">
                            <span>{job.file_size || 'Unknown size'}</span>
                            <span>•</span>
                            <span>{formatOptions.find(f => job.quality?.includes(f.value))?.label || job.quality}</span>
                            <span>•</span>
                            <span className="text-green-400 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Ready
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => job.download_url && downloadFile(job.download_url, job.video_title || 'video', job.quality || '')}
                        className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-6 py-3 rounded-lg transition-all transform hover:scale-105"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download to Device
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
