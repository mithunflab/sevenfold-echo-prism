
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
    
    // PHASE 1: Environment validation and yt-dlp setup
    await validateAndSetupEnvironment(supabase, jobId);
    
    // Parse quality and format
    const [resolution, format] = quality.split('_');
    console.log('Parsed - Resolution:', resolution, 'Format:', format);

    // PHASE 2: Enhanced download process with validation
    const downloadedFile = await executeDownloadWithValidation(url, resolution, format, supabase, jobId);
    
    if (!downloadedFile) {
      throw new Error('Download failed - no valid file created');
    }

    // PHASE 3: File verification before upload
    await verifyFileIntegrity(downloadedFile, format);
    
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

// PHASE 1: Environment validation and setup
async function validateAndSetupEnvironment(supabase: any, jobId: string): Promise<void> {
  console.log('Phase 1: Validating environment...');
  
  await supabase
    .from('download_jobs')
    .update({ 
      progress: 8,
      download_speed: 'Validating environment...',
      eta: 'Checking system requirements'
    })
    .eq('id', jobId);

  // Check if yt-dlp is available
  const ytDlpAvailable = await checkYtDlp();
  console.log('yt-dlp available:', ytDlpAvailable);

  if (!ytDlpAvailable) {
    console.log('yt-dlp not found, attempting installation...');
    const installSuccess = await installYtDlp();
    if (!installSuccess) {
      throw new Error('yt-dlp installation failed - video downloader not available');
    }
  }

  // Verify ffmpeg availability
  const ffmpegAvailable = await checkFFmpeg();
  if (!ffmpegAvailable) {
    throw new Error('FFmpeg not available - video processing will fail');
  }

  console.log('Environment validation completed successfully');
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

async function installYtDlp(): Promise<boolean> {
  try {
    console.log('Installing yt-dlp...');
    const process = new Deno.Command('pip', {
      args: ['install', '--upgrade', 'yt-dlp'],
      stdout: 'piped',
      stderr: 'piped'
    });
    const result = await process.output();
    console.log('yt-dlp installation result:', result.success);
    return result.success;
  } catch (error) {
    console.error('yt-dlp installation failed:', error);
    return false;
  }
}

async function checkFFmpeg(): Promise<boolean> {
  try {
    const process = new Deno.Command('ffmpeg', {
      args: ['-version'],
      stdout: 'piped',
      stderr: 'piped'
    });
    const result = await process.output();
    return result.success;
  } catch (error) {
    console.error('FFmpeg check failed:', error);
    return false;
  }
}

// PHASE 2: Enhanced download execution with validation
async function executeDownloadWithValidation(
  url: string, 
  resolution: string, 
  format: string, 
  supabase: any, 
  jobId: string
): Promise<string | null> {
  console.log('Phase 2: Executing enhanced download...');
  
  await supabase
    .from('download_jobs')
    .update({ 
      progress: 15,
      download_speed: 'Starting download...',
      eta: 'Connecting to video source'
    })
    .eq('id', jobId);

  // Build enhanced yt-dlp command with better error handling
  const ytDlpArgs = buildEnhancedDownloadCommand(url, resolution, format);
  console.log('Executing yt-dlp with enhanced args:', ytDlpArgs);

  // Execute with timeout and retry logic
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`Download attempt ${attempts}/${maxAttempts}`);
      
      const process = new Deno.Command('yt-dlp', {
        args: ytDlpArgs,
        stdout: 'piped',
        stderr: 'piped',
        cwd: '/tmp'
      });

      const child = process.spawn();
      
      // Enhanced progress monitoring with timeout
      const downloadedFile = await monitorDownloadWithTimeout(child, supabase, jobId, 300000); // 5 minute timeout
      
      if (downloadedFile) {
        console.log('Download successful on attempt', attempts);
        return downloadedFile;
      }
    } catch (error) {
      console.error(`Download attempt ${attempts} failed:`, error);
      
      if (attempts < maxAttempts) {
        console.log('Retrying with fallback quality...');
        // Try with lower quality on retry
        if (resolution === '1080p') resolution = '720p';
        else if (resolution === '720p') resolution = '480p';
        
        await supabase
          .from('download_jobs')
          .update({ 
            progress: 10 + (attempts * 5),
            download_speed: `Retry ${attempts}/${maxAttempts}...`,
            eta: 'Attempting with different quality'
          })
          .eq('id', jobId);
      }
    }
  }
  
  throw new Error(`Download failed after ${maxAttempts} attempts`);
}

function buildEnhancedDownloadCommand(url: string, resolution: string, format: string): string[] {
  const outputTemplate = '/tmp/%(title)s_%(uploader)s_%(id)s.%(ext)s';
  
  let args = [
    '--no-warnings',
    '--newline',
    '--progress',
    '--no-playlist',
    '--socket-timeout', '30',
    '--retries', '3',
    '--fragment-retries', '3',
    '--continue',
    '--ignore-errors',
    '--no-abort-on-error',
    '--output', outputTemplate,
    '--verbose'
  ];

  // Enhanced format selection with fallbacks
  if (format === 'audio') {
    args.push(
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--format', 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best'
    );
  } else if (format === 'video') {
    const maxHeight = resolution === '4K' ? '2160' : resolution.replace('p', '');
    args.push(
      '--format', `bestvideo[height<=${maxHeight}][ext=mp4]/bestvideo[height<=${maxHeight}]/bestvideo/best`
    );
  } else { // both (video + audio)
    const maxHeight = resolution === '4K' ? '2160' : resolution.replace('p', '');
    args.push(
      '--format', `best[height<=${maxHeight}][ext=mp4]/best[height<=${maxHeight}]/best`
    );
  }

  args.push(url);
  return args;
}

async function monitorDownloadWithTimeout(
  child: any, 
  supabase: any, 
  jobId: string, 
  timeoutMs: number
): Promise<string | null> {
  const decoder = new TextDecoder();
  let downloadProgress = 15;
  let downloadedFile = null;
  let lastProgressUpdate = Date.now();

  // Create timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Download timeout')), timeoutMs);
  });

  // Monitor stdout for progress
  const reader = child.stdout.getReader();
  const progressPromise = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const output = decoder.decode(value);
      console.log('yt-dlp output:', output);
      lastProgressUpdate = Date.now();
      
      // Enhanced progress parsing
      const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/) || 
                           output.match(/(\d+\.?\d*)% of/) ||
                           output.match(/(\d+\.?\d*)%.*ETA/);

      if (progressMatch) {
        const newProgress = Math.min(Math.max(parseFloat(progressMatch[1]), downloadProgress), 85);
        
        if (newProgress > downloadProgress + 1) {
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

      // Enhanced file detection
      if (output.includes('[download] Destination:') || output.includes('has already been downloaded')) {
        const fileMatch = output.match(/\[download\] Destination: (.+)/) || 
                         output.match(/(.+) has already been downloaded/);
        if (fileMatch) {
          downloadedFile = fileMatch[1].trim();
          console.log('Download destination detected:', downloadedFile);
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

  try {
    // Race between progress monitoring, timeout, and completion
    const [, errorOutput] = await Promise.race([
      Promise.all([progressPromise, errorPromise]),
      timeoutPromise
    ]) as any;
    
    const status = await child.status;
    
    if (!status.success) {
      throw new Error(`Download failed: ${errorOutput}`);
    }

    // Enhanced file detection with validation
    if (!downloadedFile) {
      downloadedFile = await findValidDownloadedFile();
    }

    return downloadedFile;
  } catch (error) {
    // Kill the process if it's still running
    try {
      child.kill();
    } catch (killError) {
      console.warn('Failed to kill download process:', killError);
    }
    throw error;
  }
}

// PHASE 3: File verification and integrity checks
async function verifyFileIntegrity(filePath: string, format: string): Promise<void> {
  console.log('Phase 3: Verifying file integrity for:', filePath);
  
  try {
    const fileInfo = await Deno.stat(filePath);
    console.log('File stats:', { size: fileInfo.size, path: filePath });
    
    // Check minimum file size (corrupted files are usually very small)
    const minSize = format === 'audio' ? 100000 : 1000000; // 100KB for audio, 1MB for video
    if (fileInfo.size < minSize) {
      throw new Error(`File too small (${fileInfo.size} bytes) - likely corrupted`);
    }
    
    // Read file header to verify it's actually a media file
    const file = await Deno.open(filePath, { read: true });
    const header = new Uint8Array(16);
    await file.read(header);
    file.close();
    
    // Check file magic numbers
    const isValidMedia = verifyFileHeaders(header, format);
    if (!isValidMedia) {
      throw new Error('File header verification failed - not a valid media file');
    }
    
    console.log('File integrity verification passed');
  } catch (error) {
    console.error('File integrity check failed:', error);
    throw new Error(`File verification failed: ${error.message}`);
  }
}

function verifyFileHeaders(header: Uint8Array, format: string): boolean {
  // Common video file signatures
  const videoSignatures = [
    [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // MP4
    [0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70], // MP4 variant
    [0x1A, 0x45, 0xDF, 0xA3], // WebM/MKV
  ];
  
  // Common audio file signatures
  const audioSignatures = [
    [0xFF, 0xFB], // MP3
    [0xFF, 0xF3], // MP3 variant
    [0xFF, 0xF2], // MP3 variant
    [0x49, 0x44, 0x33], // MP3 with ID3
  ];
  
  const signatures = format === 'audio' ? audioSignatures : [...videoSignatures, ...audioSignatures];
  
  for (const sig of signatures) {
    let matches = true;
    for (let i = 0; i < sig.length && i < header.length; i++) {
      if (header[i] !== sig[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      console.log('Valid file header detected');
      return true;
    }
  }
  
  console.warn('File header verification failed - unknown format');
  return false;
}

async function findValidDownloadedFile(): Promise<string | null> {
  console.log('Searching for valid downloaded files in /tmp');
  
  try {
    const files = [];
    for await (const dirEntry of Deno.readDir('/tmp')) {
      if (dirEntry.isFile) {
        const fileName = dirEntry.name;
        
        // Look for media files with reasonable names
        if ((fileName.endsWith('.mp4') || fileName.endsWith('.webm') || 
             fileName.endsWith('.mp3') || fileName.endsWith('.m4a')) && 
            !fileName.startsWith('.') && fileName.length > 10) {
          
          const filePath = `/tmp/${fileName}`;
          const fileInfo = await Deno.stat(filePath);
          
          // Skip very small files (likely corrupted)
          if (fileInfo.size > 50000) { // At least 50KB
            files.push({
              name: fileName,
              path: filePath,
              size: fileInfo.size,
              modified: fileInfo.mtime
            });
          }
        }
      }
    }

    if (files.length === 0) {
      console.log('No valid downloaded files found');
      return null;
    }

    // Get the largest recent file (most likely to be valid)
    const selectedFile = files
      .sort((a, b) => {
        // First by size (larger is better), then by modification time
        const sizeDiff = b.size - a.size;
        if (Math.abs(sizeDiff) > 1000000) return sizeDiff; // 1MB difference matters
        return (b.modified?.getTime() || 0) - (a.modified?.getTime() || 0);
      })[0];

    console.log('Selected file:', selectedFile);
    return selectedFile ? selectedFile.path : null;

  } catch (error) {
    console.error('Error finding downloaded file:', error);
    return null;
  }
}

async function uploadAndComplete(filePath: string, jobId: string, supabase: any, format: string) {
  console.log('Phase 4: Uploading verified file:', filePath);

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
  
  // Final size validation before upload
  if (fileInfo.size < 10000) { // Less than 10KB is definitely corrupted
    throw new Error(`File too small for upload (${fileInfo.size} bytes) - corrupted download`);
  }
  
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
    case 'm4a': return 'audio/mp4';
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
