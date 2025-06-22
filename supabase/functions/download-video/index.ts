
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
    const { url, quality = '1080p', userId, jobId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update job status to downloading
    await supabase
      .from('download_jobs')
      .update({ status: 'downloading', progress: 0 })
      .eq('id', jobId);

    // Create a temporary directory for downloads
    const tempDir = await Deno.makeTempDir();
    const outputPath = `${tempDir}/%(title)s.%(ext)s`;

    // Set up yt-dlp command with progress hooks
    const qualityFormat = quality === '4K' ? 'best[height<=2160]' : 
                         quality === '1440p' ? 'best[height<=1440]' : 
                         quality === '1080p' ? 'best[height<=1080]' : 
                         'best[height<=720]';

    const ytDlpProcess = new Deno.Command("yt-dlp", {
      args: [
        "--newline",
        "--progress",
        "--format", qualityFormat,
        "--output", outputPath,
        url
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const child = ytDlpProcess.spawn();
    
    // Process progress updates
    const decoder = new TextDecoder();
    const reader = child.stdout.getReader();
    
    let progressData = {
      progress: 0,
      speed: '',
      eta: ''
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const output = decoder.decode(value);
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (line.includes('[download]') && line.includes('%')) {
          // Parse progress from yt-dlp output
          const progressMatch = line.match(/(\d+(?:\.\d+)?)%/);
          const speedMatch = line.match(/(\d+(?:\.\d+)?(?:KiB|MiB|GiB)\/s)/);
          const etaMatch = line.match(/ETA (\d+:\d+)/);
          
          if (progressMatch) {
            progressData.progress = parseFloat(progressMatch[1]);
          }
          if (speedMatch) {
            progressData.speed = speedMatch[1];
          }
          if (etaMatch) {
            progressData.eta = etaMatch[1];
          }
          
          // Update database with progress
          await supabase
            .from('download_jobs')
            .update({
              progress: progressData.progress,
              download_speed: progressData.speed,
              eta: progressData.eta
            })
            .eq('id', jobId);
        }
      }
    }

    const status = await child.status;
    
    if (status.code === 0) {
      // Download completed successfully
      await supabase
        .from('download_jobs')
        .update({ 
          status: 'completed', 
          progress: 100,
          download_speed: '',
          eta: '' 
        })
        .eq('id', jobId);

      return new Response(
        JSON.stringify({ success: true, message: 'Download completed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Download failed
      await supabase
        .from('download_jobs')
        .update({ 
          status: 'failed',
          error_message: 'Download failed'
        })
        .eq('id', jobId);

      return new Response(
        JSON.stringify({ error: 'Download failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Download error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
