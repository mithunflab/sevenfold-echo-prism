
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
        progress: 5,
        download_speed: 'Initializing...',
        eta: 'Starting download process...'
      })
      .eq('id', jobId);

    // Start async download process
    downloadVideoProcess(url, quality, jobId, supabase);

    return new Response(
      JSON.stringify({ success: true, message: 'Download process started' }),
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

async function downloadVideoProcess(url: string, quality: string, jobId: string, supabase: any) {
  try {
    console.log('Processing download for job:', jobId);
    
    // Parse quality and format
    const [resolution, format] = quality.split('_');
    console.log('Parsed - Resolution:', resolution, 'Format:', format);

    // Update progress - format validation
    await supabase
      .from('download_jobs')
      .update({ 
        progress: 10,
        download_speed: 'Validating format...',
        eta: 'Checking video availability'
      })
      .eq('id', jobId);

    // Check if yt-dlp is available
    const ytDlpAvailable = await checkYtDlp();
    console.log('yt-dlp available:', ytDlpAvailable);

    if (!ytDlpAvailable) {
      throw new Error('Video downloader not available in environment');
    }

    // Build yt-dlp command
    const ytDlpArgs = buildDownloadCommand(url, resolution, format);
    console.log('Executing yt-dlp with args:', ytDlpArgs);

    // Update progress - starting download
    await supabase
      .from('download_jobs')
      .update({ 
        progress: 15,
        download_speed: 'Starting download...',
        eta: 'Connecting to video source'
      })
      .eq('id', jobId);

    // Execute download with progress monitoring
    const process = new Deno.Command('yt-dlp', {
      args: ytDlpArgs,
      stdout: 'piped',
      stderr: 'piped',
      cwd: '/tmp'
    });

    const child = process.spawn();
    const downloadedFile = await monitorDownloadWithProgress(child, supabase, jobId);

    if (!downloadedFile) {
      throw new Error('Download failed - no file created');
    }

    // Upload to storage and finalize
    await uploadAndComplete(downloadedFile, jobId, supabase, format);
    
    console.log('Download completed successfully for job:', jobId);

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

async function checkYtDlp(): Promise<boolean> {
  try {
    const process = new Deno.Command('yt-dlp', {
      args: ['--version'],
      stdout: 'piped',
      stderr: 'piped'
    });
    const result = await process.output();
    console.log('yt-dlp version check result:', result.success);
    return result.success;
  } catch (error) {
    console.error('yt-dlp check failed:', error);
    return false;
  }
}

function buildDownloadCommand(url: string, resolution: string, format: string): string[] {
  const outputTemplate = '/tmp/%(title)s_%(id)s.%(ext)s';
  
  let args = [
    '--no-warnings',
    '--newline',
    '--progress',
    '--no-playlist',
    '--socket-timeout', '30',
    '--retries', '3',
    '--output', outputTemplate
  ];

  // Format-specific arguments
  if (format === 'audio') {
    args.push(
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--format', 'bestaudio/best'
    );
  } else if (format === 'video') {
    const maxHeight = resolution === '4K' ? '2160' : resolution.replace('p', '');
    args.push(
      '--format', `bestvideo[height<=${maxHeight}]/best[height<=${maxHeight}]`
    );
  } else { // both (video + audio)
    const maxHeight = resolution === '4K' ? '2160' : resolution.replace('p', '');
    args.push(
      '--format', `best[height<=${maxHeight}]/best`
    );
  }

  args.push(url);
  return args;
}

async function monitorDownloadWithProgress(child: any, supabase: any, jobId: string): Promise<any> {
  const decoder = new TextDecoder();
  let downloadProgress = 15;
  let downloadedFile = null;

  // Monitor stdout for progress
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
        const newProgress = Math.min(Math.max(parseFloat(progressMatch[1]), downloadProgress), 85);
        
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

      // Check for destination file info
      if (output.includes('[download] Destination:')) {
        const fileMatch = output.match(/\[download\] Destination: (.+)/);
        if (fileMatch) {
          downloadedFile = fileMatch[1].trim();
          console.log('Download destination:', downloadedFile);
        }
      }
    }
  })();

  // Monitor stderr for errors
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
    throw new Error(`Download failed: ${errorOutput}`);
  }

  // If no specific file was detected, find the downloaded file
  if (!downloadedFile) {
    downloadedFile = await findDownloadedFile();
  }

  return downloadedFile;
}

async function findDownloadedFile(): Promise<string | null> {
  console.log('Searching for downloaded files in /tmp');
  
  try {
    const files = [];
    for await (const dirEntry of Deno.readDir('/tmp')) {
      if (dirEntry.isFile) {
        const fileName = dirEntry.name;
        
        // Look for video/audio files that aren't system files
        if ((fileName.endsWith('.mp4') || fileName.endsWith('.webm') || fileName.endsWith('.mp3')) && 
            !fileName.startsWith('.') && fileName.length > 10) {
          
          const filePath = `/tmp/${fileName}`;
          const fileInfo = await Deno.stat(filePath);
          
          files.push({
            name: fileName,
            path: filePath,
            size: fileInfo.size,
            modified: fileInfo.mtime
          });
        }
      }
    }

    if (files.length === 0) {
      console.log('No downloaded files found');
      return null;
    }

    // Get the most recently modified file with reasonable size
    const selectedFile = files
      .filter(f => f.size > 1000) // At least 1KB
      .sort((a, b) => (b.modified?.getTime() || 0) - (a.modified?.getTime() || 0))[0];

    console.log('Selected file:', selectedFile);
    return selectedFile ? selectedFile.path : null;

  } catch (error) {
    console.error('Error finding downloaded file:', error);
    return null;
  }
}

async function uploadAndComplete(filePath: string, jobId: string, supabase: any, format: string) {
  console.log('Uploading file:', filePath);

  // Update progress - uploading
  await supabase
    .from('download_jobs')
    .update({ 
      progress: 90,
      download_speed: 'Uploading...',
      eta: 'Almost done'
    })
    .eq('id', jobId);

  // Read file
  const fileData = await Deno.readFile(filePath);
  const fileInfo = await Deno.stat(filePath);
  
  // Generate storage filename
  const timestamp = Date.now();
  const fileName = filePath.split('/').pop() || 'download';
  const extension = fileName.split('.').pop() || 'mp4';
  const storageFileName = `${format}_${jobId}_${timestamp}.${extension}`;
  
  console.log('Uploading to storage:', storageFileName, 'Size:', fileInfo.size);

  // Upload to Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('downloads')
    .upload(storageFileName, fileData, {
      contentType: getContentType(extension),
      upsert: true
    });

  if (uploadError) {
    console.error('Upload error:', uploadError);
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  console.log('Upload successful:', uploadData);

  // Generate signed URL (valid for 2 hours)
  const { data: urlData, error: urlError } = await supabase.storage
    .from('downloads')
    .createSignedUrl(storageFileName, 7200);

  if (urlError || !urlData?.signedUrl) {
    console.error('URL generation error:', urlError);
    throw new Error('Failed to generate download URL');
  }

  console.log('Generated download URL:', urlData.signedUrl);

  const formattedFileSize = formatFileSize(fileInfo.size);
  
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

  // Clean up temp file
  try {
    await Deno.remove(filePath);
    console.log('Cleaned up temp file:', filePath);
  } catch (cleanupError) {
    console.warn('Failed to clean up temp file:', cleanupError);
  }
}

function getContentType(extension: string): string {
  const ext = extension.toLowerCase();
  switch (ext) {
    case 'mp3': return 'audio/mpeg';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'avi': return 'video/x-msvideo';
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
