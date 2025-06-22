
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url, userId } = await req.json();
    
    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
      return new Response(
        JSON.stringify({ error: 'Invalid YouTube URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use yt-dlp to get video info
    const ytDlpProcess = new Deno.Command("yt-dlp", {
      args: [
        "--dump-json",
        "--no-warnings",
        "--format", "best[height<=1080]",
        url
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await ytDlpProcess.output();
    
    if (code !== 0) {
      const errorText = new TextDecoder().decode(stderr);
      console.error("yt-dlp error:", errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch video information' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const videoData = JSON.parse(new TextDecoder().decode(stdout));
    
    const videoInfo = {
      title: videoData.title || 'Unknown Title',
      thumbnail: videoData.thumbnail || '',
      duration: formatDuration(videoData.duration || 0),
      uploader: videoData.uploader || 'Unknown Uploader',
      view_count: formatViewCount(videoData.view_count || 0),
      formats: videoData.formats?.filter((f: any) => f.vcodec !== 'none' && f.height) || []
    };

    return new Response(
      JSON.stringify(videoInfo),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatViewCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M views`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K views`;
  }
  return `${count} views`;
}
