
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

    // Detect platform and extract video info
    let videoInfo;
    
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      videoInfo = await getYouTubeInfo(url);
    } else if (url.includes('facebook.com') || url.includes('fb.watch')) {
      videoInfo = await getFacebookInfo(url);
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
      videoInfo = await getTwitterInfo(url);
    } else if (url.includes('instagram.com')) {
      videoInfo = await getInstagramInfo(url);
    } else if (url.includes('tiktok.com')) {
      videoInfo = await getTikTokInfo(url);
    } else {
      // Generic handler for other platforms
      videoInfo = await getGenericInfo(url);
    }

    console.log('Returning video info:', videoInfo);

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

async function getYouTubeInfo(url: string) {
  // Extract video ID from URL
  let videoId = '';
  if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1].split('?')[0];
  } else if (url.includes('watch?v=')) {
    videoId = url.split('watch?v=')[1].split('&')[0];
  }

  if (!videoId) {
    throw new Error('Could not extract video ID from YouTube URL');
  }

  // Use YouTube oEmbed API
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const oembedResponse = await fetch(oembedUrl);
  
  if (!oembedResponse.ok) {
    throw new Error('Failed to fetch video information from YouTube');
  }

  const oembedData = await oembedResponse.json();
  
  return {
    title: oembedData.title || 'Unknown Title',
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    duration: 'Unknown',
    uploader: oembedData.author_name || 'Unknown Uploader',
    view_count: 'Unknown views',
    formats: [
      { height: 144, ext: 'mp4', format_note: '144p' },
      { height: 360, ext: 'mp4', format_note: '360p' },
      { height: 720, ext: 'mp4', format_note: '720p' },
      { height: 1080, ext: 'mp4', format_note: '1080p' },
      { height: 1440, ext: 'mp4', format_note: '1440p' },
      { height: 2160, ext: 'mp4', format_note: '4K' }
    ]
  };
}

async function getFacebookInfo(url: string) {
  // For Facebook, we'll use a generic approach since their API is restrictive
  return {
    title: 'Facebook Video',
    thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=225&fit=crop',
    duration: 'Unknown',
    uploader: 'Facebook User',
    view_count: 'Unknown views',
    formats: [
      { height: 360, ext: 'mp4', format_note: '360p' },
      { height: 720, ext: 'mp4', format_note: '720p' },
      { height: 1080, ext: 'mp4', format_note: '1080p' }
    ]
  };
}

async function getTwitterInfo(url: string) {
  return {
    title: 'Twitter/X Video',
    thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=225&fit=crop',
    duration: 'Unknown',
    uploader: 'Twitter User',
    view_count: 'Unknown views',
    formats: [
      { height: 360, ext: 'mp4', format_note: '360p' },
      { height: 720, ext: 'mp4', format_note: '720p' }
    ]
  };
}

async function getInstagramInfo(url: string) {
  return {
    title: 'Instagram Video',
    thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=225&fit=crop',
    duration: 'Unknown',
    uploader: 'Instagram User',
    view_count: 'Unknown views',
    formats: [
      { height: 360, ext: 'mp4', format_note: '360p' },
      { height: 720, ext: 'mp4', format_note: '720p' },
      { height: 1080, ext: 'mp4', format_note: '1080p' }
    ]
  };
}

async function getTikTokInfo(url: string) {
  return {
    title: 'TikTok Video',
    thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=225&fit=crop',
    duration: 'Unknown',
    uploader: 'TikTok User',
    view_count: 'Unknown views',
    formats: [
      { height: 720, ext: 'mp4', format_note: '720p' },
      { height: 1080, ext: 'mp4', format_note: '1080p' }
    ]
  };
}

async function getGenericInfo(url: string) {
  return {
    title: 'Video from Supported Platform',
    thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=225&fit=crop',
    duration: 'Unknown',
    uploader: 'Content Creator',
    view_count: 'Unknown views',
    formats: [
      { height: 360, ext: 'mp4', format_note: '360p' },
      { height: 720, ext: 'mp4', format_note: '720p' },
      { height: 1080, ext: 'mp4', format_note: '1080p' }
    ]
  };
}
