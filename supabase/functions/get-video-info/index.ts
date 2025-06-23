
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing URL:', url);

    // Check if yt-dlp is available
    const checkYtDlp = async () => {
      try {
        const process = new Deno.Command('yt-dlp', {
          args: ['--version'],
          stdout: 'piped',
          stderr: 'piped'
        });
        const result = await process.output();
        return result.success;
      } catch (error) {
        console.error('yt-dlp check failed:', error);
        return false;
      }
    };

    const ytDlpAvailable = await checkYtDlp();
    console.log('yt-dlp available:', ytDlpAvailable);

    if (!ytDlpAvailable) {
      // Fallback to basic info extraction for supported platforms
      return getBasicVideoInfo(url);
    }

    // Use yt-dlp to extract real video information
    const videoInfo = await extractRealVideoInfo(url);
    
    console.log('Returning real video info:', videoInfo);

    return new Response(
      JSON.stringify(videoInfo),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch video information: ' + error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function extractRealVideoInfo(url: string) {
  console.log('Extracting real video info using yt-dlp...');
  
  try {
    // Use yt-dlp to extract video metadata
    const process = new Deno.Command('yt-dlp', {
      args: [
        '--dump-json',
        '--no-warnings',
        '--no-playlist',
        '--socket-timeout', '30',
        url
      ],
      stdout: 'piped',
      stderr: 'piped',
      env: {
        'PATH': '/opt/venv/bin:/usr/local/bin:/usr/bin:/bin'
      }
    });

    const result = await process.output();
    
    if (!result.success) {
      const errorOutput = new TextDecoder().decode(result.stderr);
      console.error('yt-dlp JSON extraction failed:', errorOutput);
      throw new Error(`Failed to extract video info: ${errorOutput}`);
    }

    const jsonOutput = new TextDecoder().decode(result.stdout);
    const videoData = JSON.parse(jsonOutput);
    
    console.log('Raw yt-dlp data extracted successfully');
    
    // Extract and format the information
    const formats = videoData.formats || [];
    
    // Filter and organize available formats
    const videoFormats = formats
      .filter((f: any) => f.vcodec && f.vcodec !== 'none' && f.height)
      .map((f: any) => ({
        height: f.height,
        ext: f.ext || 'mp4',
        format_note: `${f.height}p`,
        filesize: f.filesize,
        fps: f.fps,
        vcodec: f.vcodec,
        acodec: f.acodec
      }))
      .sort((a: any, b: any) => b.height - a.height);

    const audioFormats = formats
      .filter((f: any) => f.acodec && f.acodec !== 'none' && !f.vcodec)
      .map((f: any) => ({
        ext: f.ext || 'mp3',
        format_note: 'audio',
        abr: f.abr,
        acodec: f.acodec,
        filesize: f.filesize
      }));

    // Get unique video qualities
    const uniqueVideoFormats = videoFormats.filter((format: any, index: number, self: any[]) => 
      index === self.findIndex((f: any) => f.height === format.height)
    );

    return {
      title: videoData.title || 'Unknown Title',
      thumbnail: videoData.thumbnail || videoData.thumbnails?.[0]?.url || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=225&fit=crop',
      duration: formatDuration(videoData.duration) || 'Unknown',
      uploader: videoData.uploader || videoData.channel || 'Unknown Uploader',
      view_count: formatViewCount(videoData.view_count) || 'Unknown views',
      formats: [...uniqueVideoFormats, ...audioFormats],
      platform: detectPlatform(url),
      available_qualities: uniqueVideoFormats.map((f: any) => f.format_note),
      has_audio: audioFormats.length > 0,
      has_video: videoFormats.length > 0
    };

  } catch (error) {
    console.error('Real extraction failed, falling back:', error);
    // Fallback to basic extraction if yt-dlp fails
    return getBasicVideoInfo(url);
  }
}

async function getBasicVideoInfo(url: string) {
  console.log('Using basic info extraction as fallback');
  
  const platform = detectPlatform(url);
  let title = `${platform} Video`;
  let thumbnail = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=225&fit=crop';
  let uploader = `${platform} User`;

  // Try to get YouTube info via oEmbed if available
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    try {
      let videoId = '';
      if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
      } else if (url.includes('watch?v=')) {
        videoId = url.split('watch?v=')[1].split('&')[0];
      }

      if (videoId) {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const oembedResponse = await fetch(oembedUrl);
        
        if (oembedResponse.ok) {
          const oembedData = await oembedResponse.json();
          title = oembedData.title || title;
          uploader = oembedData.author_name || uploader;
          thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }
      }
    } catch (error) {
      console.warn('YouTube oEmbed failed:', error);
    }
  }

  return {
    title,
    thumbnail,
    duration: 'Unknown',
    uploader,
    view_count: 'Unknown views',
    formats: [
      { height: 144, ext: 'mp4', format_note: '144p' },
      { height: 360, ext: 'mp4', format_note: '360p' },
      { height: 720, ext: 'mp4', format_note: '720p' },
      { height: 1080, ext: 'mp4', format_note: '1080p' },
      { height: 1440, ext: 'mp4', format_note: '1440p' },
      { height: 2160, ext: 'mp4', format_note: '4K' }
    ],
    platform,
    available_qualities: ['144p', '360p', '720p', '1080p', '1440p', '4K'],
    has_audio: true,
    has_video: true,
    fallback: true
  };
}

function detectPlatform(url: string): string {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('facebook.com') || url.includes('fb.watch')) return 'Facebook';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'Twitter/X';
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('dailymotion.com')) return 'Dailymotion';
  if (url.includes('vimeo.com')) return 'Vimeo';
  if (url.includes('twitch.tv')) return 'Twitch';
  return 'Supported Platform';
}

function formatDuration(seconds: number): string {
  if (!seconds) return 'Unknown';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatViewCount(count: number): string {
  if (!count) return 'Unknown views';
  
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M views`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K views`;
  }
  return `${count} views`;
}
