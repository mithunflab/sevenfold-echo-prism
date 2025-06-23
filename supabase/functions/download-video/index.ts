
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
        download_speed: 'Validating format...',
        eta: 'Checking availability...'
      })
      .eq('id', jobId);

    // Check yt-dlp availability
    const ytDlpAvailable = await checkYtDlp();
    console.log('yt-dlp available:', ytDlpAvailable);

    if (!ytDlpAvailable) {
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

    // Start async download process with enhanced format validation
    downloadVideoWithValidation(url, quality, jobId, supabase);

    return new Response(
      JSON.stringify({ success: true, message: 'Download started with format validation' }),
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

async function checkYtDlp(): Promise<boolean> {
  try {
    const process = new Deno.Command('yt-dlp', {
      args: ['--version'],
      stdout: 'piped',
      stderr: 'piped'
    });
    const result = await process.output();
    return result.success;
  } catch (error) {
    console.error('yt-dlp check failed:', error);
    return false;
  }
}

async function downloadVideoWithValidation(url: string, quality: string, jobId: string, supabase: any) {
  try {
    console.log('Processing download with validation for job:', jobId);
    
    // Parse quality and format
    const [resolution, format] = quality.split('_');
    console.log('Parsed - Resolution:', resolution, 'Format:', format);

    // Step 1: Validate available formats
    await supabase
      .from('download_jobs')
      .update({ 
        progress: 5,
        download_speed: 'Checking available formats...',
        eta: 'Validating quality options'
      })
      .eq('id', jobId);

    const availableFormats = await getAvailableFormats(url);
    const selectedFormat = await validateAndSelectFormat(availableFormats, resolution, format);
    
    if (!selectedFormat) {
      throw new Error(`Requested quality ${resolution} in ${format} format is not available for this video`);
    }

    console.log('Selected format:', selectedFormat);

    // Step 2: Update progress with validated format
    await supabase
      .from('download_jobs')
      .update({ 
        progress: 10,
        download_speed: 'Format validated, starting download...',
        eta: 'Beginning download process'
      })
      .eq('id', jobId);

    // Step 3: Build precise yt-dlp command
    const ytDlpArgs = await buildPreciseDownloadCommand(url, selectedFormat, format);
    console.log('Executing yt-dlp with validated args:', ytDlpArgs);

    // Step 4: Execute download with real-time progress
    const process = new Deno.Command('yt-dlp', {
      args: ytDlpArgs,
      stdout: 'piped',
      stderr: 'piped',
      env: {
        'PATH': '/opt/venv/bin:/usr/local/bin:/usr/bin:/bin'
      }
    });

    const child = process.spawn();
    await monitorDownloadProgress(child, supabase, jobId);

    // Step 5: Validate and process downloaded file
    const downloadedFile = await findAndValidateDownloadedFile(format);
    
    if (!downloadedFile) {
      throw new Error('Downloaded file not found or validation failed');
    }

    // Step 6: Upload and finalize
    const downloadUrl = await uploadAndFinalize(downloadedFile, jobId, supabase, format);
    
    console.log('Download completed successfully with validated format');

  } catch (error) {
    console.error('Download process failed:', error);
    await supabase
      .from('download_jobs')
      .update({ 
        status: 'failed',
        error_message: error.message || 'Download failed with format validation',
        progress: 0,
        download_speed: null,
        eta: null
      })
      .eq('id', jobId);
  }
}

async function getAvailableFormats(url: string): Promise<any[]> {
  try {
    const process = new Deno.Command('yt-dlp', {
      args: [
        '--list-formats',
        '--no-warnings',
        '--no-playlist',
        url
      ],
      stdout: 'piped',
      stderr: 'piped',
      env: {
        'PATH': '/opt/venv/bin:/usr/local/bin:/usr/bin:/bin'
      }
    });

    const result = await process.output();
    
    if (!result.success) {
      throw new Error('Failed to get available formats');
    }

    const output = new TextDecoder().decode(result.stdout);
    console.log('Available formats retrieved successfully');
    
    // Parse the format list (simplified parsing)
    const formats = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('mp4') || line.includes('webm') || line.includes('mp3')) {
        // Extract format info from yt-dlp output
        const match = line.match(/(\d+)x(\d+).*?(\d+)p/);
        if (match) {
          formats.push({
            height: parseInt(match[3]),
            resolution: `${match[3]}p`,
            available: true
          });
        }
      }
    }
    
    return formats;
  } catch (error) {
    console.warn('Could not get detailed formats, using fallback');
    return []; // Return empty array to trigger fallback
  }
}

async function validateAndSelectFormat(availableFormats: any[], requestedResolution: string, requestedFormat: string): Promise<any> {
  console.log('Validating format - Requested:', requestedResolution, requestedFormat);
  
  // If no formats detected, allow download attempt (yt-dlp will handle best selection)
  if (availableFormats.length === 0) {
    console.log('No specific formats detected, allowing yt-dlp to select best');
    return { resolution: requestedResolution, format: requestedFormat, validated: false };
  }

  // Check if requested resolution is available
  const resolutionNumber = requestedResolution === '4K' ? 2160 : parseInt(requestedResolution.replace('p', ''));
  const availableResolution = availableFormats.find(f => f.height === resolutionNumber);
  
  if (availableResolution) {
    console.log('Exact format match found');
    return { resolution: requestedResolution, format: requestedFormat, validated: true };
  }

  // Find closest available resolution
  const sortedFormats = availableFormats.sort((a, b) => Math.abs(a.height - resolutionNumber) - Math.abs(b.height - resolutionNumber));
  const closestFormat = sortedFormats[0];
  
  if (closestFormat) {
    console.log('Using closest available format:', closestFormat);
    return { resolution: `${closestFormat.height}p`, format: requestedFormat, validated: true, fallback: true };
  }

  return null; // No suitable format found
}

async function buildPreciseDownloadCommand(url: string, selectedFormat: any, format: string): Promise<string[]> {
  let outputTemplate = '/tmp/%(title)s_%(id)s.%(ext)s';
  
  let args = [
    '--no-warnings',
    '--newline',
    '--progress',
    '--no-playlist',
    '--socket-timeout', '30',
    '--output', outputTemplate
  ];

  // Precise format selection based on user choice and validation
  if (format === 'audio') {
    args.push(
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--format', 'bestaudio/best'
    );
  } else if (format === 'video') {
    const maxHeight = selectedFormat.resolution === '4K' ? '2160' : selectedFormat.resolution.replace('p', '');
    args.push(
      '--format', `bestvideo[height<=${maxHeight}][ext=mp4]/bestvideo[height<=${maxHeight}]/best[height<=${maxHeight}]`
    );
  } else { // both (video + audio)
    const maxHeight = selectedFormat.resolution === '4K' ? '2160' : selectedFormat.resolution.replace('p', '');
    args.push(
      '--format', `best[height<=${maxHeight}][ext=mp4]/best[height<=${maxHeight}]/best`
    );
  }

  args.push(url);
  return args;
}

async function monitorDownloadProgress(child: any, supabase: any, jobId: string): Promise<void> {
  const decoder = new TextDecoder();
  let downloadProgress = 10;

  // Monitor stdout for progress
  const reader = child.stdout.getReader();
  const progressPromise = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const output = decoder.decode(value);
      console.log('yt-dlp progress:', output);
      
      // Enhanced progress parsing
      const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/) || 
                           output.match(/(\d+\.?\d*)% of/) ||
                           output.match(/(\d+\.?\d*)%.*ETA/);

      if (progressMatch) {
        const newProgress = Math.min(parseFloat(progressMatch[1]), 90);
        
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
}

async function findAndValidateDownloadedFile(format: string): Promise<{ name: string; path: string; size: number } | null> {
  console.log('Finding and validating downloaded file...');
  
  const files = [];
  for await (const dirEntry of Deno.readDir('/tmp')) {
    if (dirEntry.isFile) {
      const fileName = dirEntry.name;
      const isTargetFormat = (
        (format === 'audio' && fileName.endsWith('.mp3')) ||
        (format !== 'audio' && (fileName.endsWith('.mp4') || fileName.endsWith('.webm')))
      );
      
      if (isTargetFormat && !fileName.startsWith('.') && fileName.length > 10) {
        const filePath = `/tmp/${fileName}`;
        const fileInfo = await Deno.stat(filePath);
        
        files.push({
          name: fileName,
          path: filePath,
          size: fileInfo.size
        });
        
        console.log('Found file:', fileName, 'Size:', fileInfo.size);
      }
    }
  }

  if (files.length === 0) {
    throw new Error('No downloaded file found matching requested format');
  }

  // Get the largest file (usually the best quality)
  const selectedFile = files.sort((a, b) => b.size - a.size)[0];
  
  // Validate file is not empty and has reasonable size
  if (selectedFile.size === 0) {
    throw new Error('Downloaded file is empty');
  }
  
  if (selectedFile.size < 1000) { // Less than 1KB is suspicious
    throw new Error('Downloaded file is too small, may be corrupted');
  }

  console.log('File validation passed:', selectedFile);
  return selectedFile;
}

async function uploadAndFinalize(file: any, jobId: string, supabase: any, format: string): Promise<string> {
  // Read file
  const fileData = await Deno.readFile(file.path);
  
  // Upload to Supabase Storage
  const timestamp = Date.now();
  const actualExtension = file.name.split('.').pop();
  const storageFileName = `${format}_${jobId}_${timestamp}.${actualExtension}`;
  
  console.log('Uploading to storage:', storageFileName, 'Size:', file.size);

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

  const formattedFileSize = formatFileSize(file.size);
  
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
    await Deno.remove(file.path);
  } catch (cleanupError) {
    console.warn('Failed to clean up temp file:', cleanupError);
  }

  return urlData.signedUrl;
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
