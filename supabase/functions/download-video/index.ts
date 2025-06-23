
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

    console.log('Starting real video download for job:', jobId);

    // Parse quality and format
    const [resolution, format] = quality.split('_');
    
    // Update job status to downloading immediately
    await supabase
      .from('download_jobs')
      .update({ 
        status: 'downloading',
        progress: 0,
        download_speed: '0 MB/s',
        eta: 'Starting download...'
      })
      .eq('id', jobId);

    // Real yt-dlp download process
    const downloadVideo = async () => {
      try {
        // Update status to extracting info
        await supabase
          .from('download_jobs')
          .update({ 
            progress: 5,
            download_speed: 'Extracting...',
            eta: 'Getting video info'
          })
          .eq('id', jobId);

        // Build yt-dlp command based on format and quality
        let ytDlpArgs = [
          '--no-warnings',
          '--extract-flat', 'false',
          '--format'
        ];

        // Set format based on user selection
        if (format === 'audio') {
          ytDlpArgs.push('bestaudio/best');
          ytDlpArgs.push('--extract-audio');
          ytDlpArgs.push('--audio-format', 'mp3');
        } else if (format === 'video') {
          ytDlpArgs.push(`best[height<=${resolution.replace('p', '')}][ext=mp4]/best[ext=mp4]/best`);
        } else { // both
          ytDlpArgs.push(`best[height<=${resolution.replace('p', '')}][ext=mp4]/best[ext=mp4]/best`);
        }

        ytDlpArgs.push('--output', '/tmp/%(title)s.%(ext)s');
        ytDlpArgs.push(url);

        // Execute yt-dlp
        const process = new Deno.Command('yt-dlp', {
          args: ytDlpArgs,
          stdout: 'piped',
          stderr: 'piped'
        });

        const child = process.spawn();
        const decoder = new TextDecoder();
        let downloadProgress = 5;

        // Read progress from yt-dlp output
        const reader = child.stdout.getReader();
        const errorReader = child.stderr.getReader();

        // Monitor progress
        const progressPromise = (async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const output = decoder.decode(value);
            console.log('yt-dlp output:', output);
            
            // Parse progress from yt-dlp output
            const progressMatch = output.match(/(\d+\.?\d*)%/);
            if (progressMatch) {
              downloadProgress = Math.min(parseFloat(progressMatch[1]), 95);
              
              const speedMatch = output.match(/(\d+\.?\d*\w+\/s)/);
              const etaMatch = output.match(/ETA (\d+:\d+)/);
              
              await supabase
                .from('download_jobs')
                .update({ 
                  progress: downloadProgress,
                  download_speed: speedMatch ? speedMatch[1] : 'Calculating...',
                  eta: etaMatch ? etaMatch[1] : 'Calculating...'
                })
                .eq('id', jobId);
            }
          }
        })();

        // Monitor errors
        const errorPromise = (async () => {
          let errorOutput = '';
          while (true) {
            const { done, value } = await errorReader.read();
            if (done) break;
            errorOutput += decoder.decode(value);
          }
          if (errorOutput) {
            console.error('yt-dlp error:', errorOutput);
          }
          return errorOutput;
        })();

        // Wait for both progress monitoring and error monitoring
        const [, errorOutput] = await Promise.all([progressPromise, errorPromise]);
        
        // Wait for process to complete
        const status = await child.status;
        
        if (!status.success) {
          throw new Error(`yt-dlp failed: ${errorOutput}`);
        }

        // Find the downloaded file
        const files = [];
        for await (const dirEntry of Deno.readDir('/tmp')) {
          if (dirEntry.isFile && (dirEntry.name.endsWith('.mp4') || dirEntry.name.endsWith('.mp3'))) {
            files.push(dirEntry.name);
          }
        }

        if (files.length === 0) {
          throw new Error('No video file found after download');
        }

        const fileName = files[0];
        const filePath = `/tmp/${fileName}`;
        
        // Read the downloaded file
        const fileData = await Deno.readFile(filePath);
        
        // Generate a unique filename for storage
        const timestamp = Date.now();
        const extension = fileName.split('.').pop();
        const storageFileName = `video_${jobId}_${timestamp}.${extension}`;
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('downloads')
          .upload(storageFileName, fileData, {
            contentType: getContentType(extension || 'mp4'),
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // Generate download URL
        const { data: urlData } = await supabase.storage
          .from('downloads')
          .createSignedUrl(storageFileName, 3600); // 1 hour expiry

        const fileSize = formatFileSize(fileData.length);
        
        // Mark as completed with download URL
        await supabase
          .from('download_jobs')
          .update({ 
            status: 'completed',
            progress: 100,
            download_speed: null,
            eta: null,
            file_size: fileSize,
            download_url: urlData?.signedUrl || null
          })
          .eq('id', jobId);

        // Clean up temporary file
        try {
          await Deno.remove(filePath);
        } catch (cleanupError) {
          console.warn('Failed to clean up temp file:', cleanupError);
        }

        console.log('Real download completed for job:', jobId);

      } catch (error) {
        console.error('Download process failed:', error);
        await supabase
          .from('download_jobs')
          .update({ 
            status: 'failed',
            error_message: error.message
          })
          .eq('id', jobId);
      }
    };

    // Start the download process
    downloadVideo();

    return new Response(
      JSON.stringify({ success: true, message: 'Download started successfully' }),
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

// Helper functions
function getContentType(extension: string): string {
  switch (extension.toLowerCase()) {
    case 'mp3': return 'audio/mpeg';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mkv': return 'video/x-matroska';
    default: return 'video/mp4';
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
