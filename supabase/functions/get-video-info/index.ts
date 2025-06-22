
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
    
    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
      return new Response(
        JSON.stringify({ error: 'Invalid YouTube URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing URL:', url);

    // Extract video ID from URL
    let videoId = '';
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1].split('?')[0];
    } else if (url.includes('watch?v=')) {
      videoId = url.split('watch?v=')[1].split('&')[0];
    }

    if (!videoId) {
      throw new Error('Could not extract video ID from URL');
    }

    console.log('Video ID:', videoId);

    // Use YouTube oEmbed API to get basic video information
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    
    console.log('Fetching from oEmbed API:', oembedUrl);
    
    const oembedResponse = await fetch(oembedUrl);
    
    if (!oembedResponse.ok) {
      console.error('oEmbed API error:', oembedResponse.status, oembedResponse.statusText);
      throw new Error('Failed to fetch video information from YouTube');
    }

    const oembedData = await oembedResponse.json();
    console.log('oEmbed data:', oembedData);

    // Try to get additional info from YouTube's page (for thumbnail and duration)
    let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    let duration = 'Unknown';
    let viewCount = 'Unknown views';

    try {
      // Get high-quality thumbnail
      const thumbnailResponse = await fetch(thumbnailUrl);
      if (!thumbnailResponse.ok) {
        // Fallback to standard quality thumbnail
        thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      }
    } catch (error) {
      console.log('Thumbnail fetch error:', error);
      thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }

    const videoInfo = {
      title: oembedData.title || 'Unknown Title',
      thumbnail: thumbnailUrl,
      duration: duration,
      uploader: oembedData.author_name || 'Unknown Uploader',
      view_count: viewCount,
      formats: [
        { height: 720, ext: 'mp4', format_note: '720p' },
        { height: 1080, ext: 'mp4', format_note: '1080p' },
        { height: 1440, ext: 'mp4', format_note: '1440p' },
        { height: 2160, ext: 'mp4', format_note: '4K' }
      ]
    };

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
