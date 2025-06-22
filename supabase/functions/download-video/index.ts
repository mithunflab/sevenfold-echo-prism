
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

    console.log('Starting download simulation for job:', jobId);

    // Update job status to downloading
    await supabase
      .from('download_jobs')
      .update({ 
        status: 'downloading',
        progress: 0,
        download_speed: '0 MB/s',
        eta: 'Calculating...'
      })
      .eq('id', jobId);

    // Simulate download progress
    const simulateDownload = async () => {
      const totalSteps = 10;
      const stepDelay = 2000; // 2 seconds per step
      
      for (let i = 1; i <= totalSteps; i++) {
        const progress = (i / totalSteps) * 100;
        const speed = `${(Math.random() * 5 + 1).toFixed(1)} MB/s`;
        const remainingTime = Math.max(0, (totalSteps - i) * 2);
        const eta = remainingTime > 0 ? `${remainingTime}s` : 'Almost done';

        console.log(`Progress update: ${progress}%`);

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

      // Mark as completed
      await supabase
        .from('download_jobs')
        .update({ 
          status: 'completed',
          progress: 100,
          download_speed: null,
          eta: null,
          file_size: `${(Math.random() * 500 + 50).toFixed(1)} MB`
        })
        .eq('id', jobId);

      console.log('Download completed for job:', jobId);
    };

    // Start the download simulation in the background
    simulateDownload().catch(async (error) => {
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
      JSON.stringify({ success: true, message: 'Download started' }),
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
