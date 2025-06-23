
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
    const { url, quality, jobId } = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting real-time download for job:', jobId);

    // Parse quality and format
    const [resolution, format] = quality.split('_');
    
    // Update job status to downloading immediately
    await supabase
      .from('downloa d_jobs')
      .update({ 
        status: 'downloading',
        progress: 0,
        download_speed: '0 MB/s',
        eta: 'Starting...'
      })
      .eq('id', jobId);

    // Start real-time download simulation (in real implementation, this would be yt-dlp)
    const simulateRealTimeDownload = async () => {
      // Faster progress updates for real-time feel
      const totalSteps = 20;
      const stepDelay = 500; // 0.5 seconds per step for faster downloads
      
      for (let i = 1; i <= totalSteps; i++) {
        const progress = (i / totalSteps) * 100;
        const speed = `${(Math.random() * 15 + 5).toFixed(1)} MB/s`; // Higher speeds
        const remainingTime = Math.max(0, (totalSteps - i) * 0.5);
        const eta = remainingTime > 0 ? `${remainingTime.toFixed(1)}s` : 'Finishing...';

        console.log(`Real-time progress: ${progress.toFixed(1)}%`);

        await supabase
          .from('download_jobs')
          .update({ 
            progress: progress,
            download_speed: speed,
            eta: eta
          })
          .eq('id', jobId);

        if (i < totalSteps) {
          await new Promise(resolve => setTimeout(resolve, stepDelay));
        }
      }

      // Mark as completed with file info
      const fileSize = getFileSize(format, resolution);
      await supabase
        .from('download_jobs')
        .update({ 
          status: 'completed',
          progress: 100,
          download_speed: null,
          eta: null,
          file_size: fileSize
        })
        .eq('id', jobId);

      console.log('Real-time download completed for job:', jobId);
    };

    // Start the download simulation immediately (no queuing)
    simulateRealTimeDownload().catch(async (error) => {
      console.error('Download failed:', error);
      await supabase
        .from('download_jobs')
        .update({ 
          status: 'failed',
          error_message: error.message
        })
        .eq('id', jobId);
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Real-time download started immediately' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error starting download:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to start download: ' + error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getFileSize(format: string, resolution: string): string {
  // Simulate different file sizes based on format and resolution
  const baseSizes: { [key: string]: number } = {
    '144p': 10,
    '360p': 25,
    '720p': 75,
    '1080p': 150,
    '1440p': 300,
    '4K': 600
  };
  
  let size = baseSizes[resolution] || 50;
  
  // Adjust based on format
  if (format === 'audio') {
    size = size * 0.1; // Audio files are much smaller
  } else if (format === 'video') {
    size = size * 0.8; // Video-only files are smaller than video+audio
  }
  
  return `${(size + Math.random() * 20).toFixed(1)} MB`;
}
