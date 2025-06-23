
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting download for job:', jobId, 'Quality:', quality, 'URL:', url);

    // Update job status immediately
    await supabase
      .from('download_jobs')
      .update({ 
        status: 'downloading',
        progress: 0,
        download_speed: 'Initializing...',
        eta: 'Starting download...'
      })
      .eq('id', jobId);

    // Check if yt-dlp is available
    const checkYtDlp = async () => {
      try {
        const process = new Deno.Command('yt-dlp', {
          args: ['--version'],
          stdout: 'piped',
          stderr: 'piped'
        });
        const result = await process.output();
        console.log('yt-dlp check result:', result.success);
        return result.success;
      } catch (error) {
        console.error('yt-dlp check failed:', error);
        return false;
      }
    };

    const ytDlpAvailable = await checkYtDlp();
    console.log('yt-dlp available:', ytDlpAvailable);

    if (!ytDlpAvailable) {
      console.error('yt-dlp not available, updating job status to failed');
      await supabase
        .from('download_jobs')
        .update({ 
          status: 'failed',
          error_message: 'Video downloader not available. Please try again later.',
          progress: 0
        })
        .eq('id', jobId);
      
      return new Response(
        JSON.stringify({ 
          error: 'Download service temporarily unavailable',
          details: 'yt-dlp not installed in environment'
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Start async download process
    downloadVideo(url, quality, jobId, supabase);

    return new Response(
      JSON.stringify({ success: true, message: 'Download started successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in download function:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to start download: ' + error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function downloadVideo(url: string, quality: string, jobId: string, supabase: any) {
  try {
    console.log('Processing download for job:', jobId);
    
    // Parse quality and format
    const [resolution, format] = quality.split('_');
    console.log('Parsed - Resolution:', resolution, 'Format:', format);

    // Update progress
    await supabase
      .from('download_jobs')
      .update({ 
        progress: 5,
        download_speed: 'Extracting info...',
        eta: 'Getting video details'
      })
      .eq('id', jobId);

    // Build yt-dlp command
    let ytDlpArgs = [
      '--no-warnings',
      '--newline',
      '--progress',
      '--no-playlist',
      '--socket-timeout', '30'
    ];

    let outputTemplate = '/tmp/%(title)s_%(id)s.%(ext)s';
    let expectedExtension = 'mp4';

    // Format selection based on user choice
    if (format === 'audio') {
      ytDlpArgs.push(
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--format', 'bestaudio/best'
      );
      expectedExtension = 'mp3';
    } else if (format === 'video') {
      const maxHeight = resolution === '4K' ? '2160' : resolution.replace('p', '');
      ytDlpArgs.push(
        '--format', `bestvideo[height<=${maxHeight}]/best[height<=${maxHeight}]`
      );
    } else { // both
      const maxHeight = resolution === '4K' ? '2160' : resolution.replace('p', '');
      ytDlpArgs.push(
        '--format', `best[height<=${maxHeight}]/best`
      );
    }

    ytDlpArgs.push('--output', outputTemplate, url);

    console.log('Executing yt-dlp with args:', ytDlpArgs);

    // Execute yt-dlp
    const process = new Deno.Command('yt-dlp', {
      args: ytDlpArgs,
      stdout: 'piped',
      stderr: 'piped',
      env: {
        'PATH': '/opt/venv/bin:/usr/local/bin:/usr/bin:/bin'
      }
    });

    const child = process.spawn();
    const decoder = new TextDecoder();
    let downloadProgress = 5;

    // Monitor progress
    const reader = child.stdout.getReader();
    const progressPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const output = decoder.decode(value);
        console.log('yt-dlp output:', output);
        
        // Parse progress
        const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/) || 
                             output.match(/(\d+\.?\d*)% of/) ||
                             output.match(/(\d+\.?\d*)%.*ETA/);

        if (progressMatch) {
          const newProgress = Math.min(parseFloat(progressMatch[1]), 90);
          
          if (newProgress > downloadProgress + 2) {
            downloadProgress = newProgress;
            
            const speedMatch = output.match(/(\d+\.?\d*\w+\/s)/);
            const etaMatch = output.match(/ETA (\d+:\d+)/);
            
            await supabase
              .from('download_jobs')
              .update({ 
                progress: downloadProgress,
                download_speed: speedMatch ? speedMatch[1] : 'Downloading...',
                eta: etaMatch ? etaMatch[1] : 'Calculating...'
              })
              .eq('id', jobId);
          }
        }
      }
    })();

    // Monitor errors
    const errorReader = child.stderr.getReader();
    const errorPromise = (async () => {
      let errorOutput = '';
      while (true) {
        const { done, value } = await errorReader.read();
        if (done) break;
        const error = decoder.decode(value);
        errorOutput += error;
        console.log('yt-dlp stderr:', error);
      }
      return errorOutput;
    })();

    // Wait for completion
    const [, errorOutput] = await Promise.all([progressPromise, errorPromise]);
    const status = await child.status;
    
    if (!status.success) {
      throw new Error(`yt-dlp failed: ${errorOutput}`);
    }

    console.log('yt-dlp completed, searching for files...');

    // Find downloaded file
    const files = [];
    for await (const dirEntry of Deno.readDir('/tmp')) {
      if (dirEntry.isFile) {
        const fileName = dirEntry.name;
        const isTargetFormat = (
          (format === 'audio' && fileName.endsWith('.mp3')) ||
          (format !== 'audio' && (fileName.endsWith('.mp4') || fileName.endsWith('.webm')))
        );
        
        if (isTargetFormat && !fileName.startsWith('.') && fileName.length > 10) {
          files.push(fileName);
          console.log('Found file:', fileName);
        }
      }
    }

    if (files.length === 0) {
      throw new Error('No downloaded file found');
    }

    const fileName = files[0];
    const filePath = `/tmp/${fileName}`;
    
    // Read and validate file
    const fileData = await Deno.readFile(filePath);
    const fileSize = fileData.length;
    
    if (fileSize === 0) {
      throw new Error('Downloaded file is empty');
    }

    // Upload to Supabase Storage
    const timestamp = Date.now();
    const actualExtension = fileName.split('.').pop() || expectedExtension;
    const storageFileName = `${format}_${jobId}_${timestamp}.${actualExtension}`;
    
    console.log('Uploading to storage:', storageFileName, 'Size:', fileSize);

    await supabase
      .from('download_jobs')
      .update({ 
        progress: 95,
        download_speed: 'Uploading...',
        eta: 'Final step'
      })
      .eq('id', jobId);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('downloads')
      .upload(storageFileName, fileData, {
        contentType: getContentType(actualExtension),
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Generate download URL
    const { data: urlData } = await supabase.storage
      .from('downloads')
      .createSignedUrl(storageFileName, 7200);

    if (!urlData?.signedUrl) {
      throw new Error('Failed to generate download URL');
    }

    const formattedFileSize = formatFileSize(fileSize);
    
    // Mark as completed
    await supabase
      .from('download_jobs')
      .update({ 
        status: 'completed',
        progress: 100,
        download_speed: null,
        eta: null,
        file_size: formattedFileSize,
        download_url: urlData.signedUrl
      })
      .eq('id', jobId);

    // Clean up
    try {
      await Deno.remove(filePath);
    } catch (cleanupError) {
      console.warn('Failed to clean up temp file:', cleanupError);
    }

    console.log('Download completed successfully');

  } catch (error) {
    console.error('Download process failed:', error);
    await supabase
      .from('download_jobs')
      .update({ 
        status: 'failed',
        error_message: error.message || 'Download failed',
        progress: 0,
        download_speed: null,
        eta: null
      })
      .eq('id', jobId);
  }
}

function getContentType(extension: string): string {
  const ext = extension.toLowerCase();
  switch (ext) {
    case 'mp3': return 'audio/mpeg';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    default: return 'application/octet-stream';
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
