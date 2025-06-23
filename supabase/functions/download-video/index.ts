
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

    console.log('Starting download for job:', jobId, 'Quality:', quality);

    // Parse quality and format properly
    const [resolution, format] = quality.split('_');
    console.log('Parsed format:', format, 'Resolution:', resolution);
    
    // Update job status to downloading immediately
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
        return result.success;
      } catch (error) {
        console.error('yt-dlp not available:', error);
        return false;
      }
    };

    const ytDlpAvailable = await checkYtDlp();
    if (!ytDlpAvailable) {
      throw new Error('yt-dlp is not available in the environment');
    }

    // Real yt-dlp download process
    const downloadVideo = async () => {
      try {
        // Update status to extracting info
        await supabase
          .from('download_jobs')
          .update({ 
            progress: 5,
            download_speed: 'Extracting info...',
            eta: 'Getting video details'
          })
          .eq('id', jobId);

        // Build yt-dlp command based on format and quality
        let ytDlpArgs = [
          '--no-warnings',
          '--newline',
          '--progress',
          '--no-playlist'
        ];

        let outputTemplate = '/tmp/%(title)s_%(id)s.%(ext)s';
        let expectedExtension = 'mp4';

        // Set format based on user selection with proper yt-dlp syntax
        if (format === 'audio') {
          // Audio only - extract best audio and convert to mp3
          ytDlpArgs.push(
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '0', // Best quality
            '--format', 'bestaudio/best'
          );
          outputTemplate = '/tmp/%(title)s_%(id)s.%(ext)s';
          expectedExtension = 'mp3';
        } else if (format === 'video') {
          // Video only - no audio track
          const maxHeight = resolution === '4K' ? '2160' : resolution.replace('p', '');
          ytDlpArgs.push(
            '--format', `bestvideo[height<=${maxHeight}][ext=mp4]/bestvideo[height<=${maxHeight}]/best[height<=${maxHeight}]`
          );
          expectedExtension = 'mp4';
        } else { // both - video + audio
          const maxHeight = resolution === '4K' ? '2160' : resolution.replace('p', '');
          ytDlpArgs.push(
            '--format', `best[height<=${maxHeight}][ext=mp4]/best[height<=${maxHeight}]/best`
          );
          expectedExtension = 'mp4';
        }

        ytDlpArgs.push('--output', outputTemplate);
        ytDlpArgs.push(url);

        console.log('yt-dlp command:', ['yt-dlp', ...ytDlpArgs]);

        // Execute yt-dlp with proper environment
        const process = new Deno.Command('yt-dlp', {
          args: ytDlpArgs,
          stdout: 'piped',
          stderr: 'piped',
          env: {
            'PATH': '/opt/venv/bin:/usr/local/bin:/usr/bin:/bin',
            'PYTHONPATH': '/opt/venv/lib/python3.11/site-packages'
          }
        });

        const child = process.spawn();
        const decoder = new TextDecoder();
        let downloadProgress = 5;
        let lastUpdateTime = Date.now();

        // Read progress from yt-dlp output with better parsing
        const reader = child.stdout.getReader();

        // Monitor progress with improved parsing
        const progressPromise = (async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const output = decoder.decode(value);
            console.log('yt-dlp stdout:', output);
            
            // Parse progress with multiple patterns
            const progressPatterns = [
              /\[download\]\s+(\d+\.?\d*)%/,
              /(\d+\.?\d*)% of/,
              /(\d+\.?\d*)%.*ETA/
            ];

            let progressMatch = null;
            for (const pattern of progressPatterns) {
              progressMatch = output.match(pattern);
              if (progressMatch) break;
            }

            if (progressMatch) {
              const newProgress = Math.min(parseFloat(progressMatch[1]), 90);
              
              // Only update if significant change or enough time passed
              if (newProgress > downloadProgress + 1 || Date.now() - lastUpdateTime > 2000) {
                downloadProgress = newProgress;
                lastUpdateTime = Date.now();
                
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

            // Check for post-processing messages
            if (output.includes('[ExtractAudio]') || output.includes('Extracting audio') || output.includes('[ffmpeg]')) {
              await supabase
                .from('download_jobs')
                .update({ 
                  progress: Math.max(downloadProgress, 85),
                  download_speed: 'Processing...',
                  eta: 'Almost done'
                })
                .eq('id', jobId);
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

        // Wait for both monitoring promises
        const [, errorOutput] = await Promise.all([progressPromise, errorPromise]);
        
        // Wait for process to complete
        const status = await child.status;
        
        if (!status.success) {
          throw new Error(`yt-dlp failed: ${errorOutput}`);
        }

        console.log('yt-dlp completed, searching for files...');

        // Find the downloaded file with better detection
        const files = [];
        for await (const dirEntry of Deno.readDir('/tmp')) {
          if (dirEntry.isFile) {
            const fileName = dirEntry.name;
            const isTargetFormat = (
              (format === 'audio' && fileName.endsWith('.mp3')) ||
              (format !== 'audio' && (fileName.endsWith('.mp4') || fileName.endsWith('.webm') || fileName.endsWith('.mkv')))
            );
            
            // Only include files that are likely from our download (exclude system files)
            if (isTargetFormat && !fileName.startsWith('.') && fileName.length > 10) {
              files.push(fileName);
              console.log('Found file:', fileName);
            }
          }
        }

        if (files.length === 0) {
          throw new Error('No downloaded file found. Download may have failed.');
        }

        // Use the most recently created file
        const fileName = files[0];
        const filePath = `/tmp/${fileName}`;
        
        console.log('Reading file:', filePath);
        
        // Validate file exists and has content
        const fileInfo = await Deno.stat(filePath);
        if (fileInfo.size === 0) {
          throw new Error('Downloaded file is empty');
        }

        // Read the downloaded file
        const fileData = await Deno.readFile(filePath);
        const fileSize = fileData.length;
        
        // Basic file validation - check for media file headers
        const isValidMediaFile = validateMediaFile(fileData, format);
        if (!isValidMediaFile) {
          throw new Error('Downloaded file appears to be corrupted or invalid');
        }

        // Generate a unique filename for storage
        const timestamp = Date.now();
        const actualExtension = fileName.split('.').pop() || expectedExtension;
        const storageFileName = `${format}_${jobId}_${timestamp}.${actualExtension}`;
        
        console.log('Uploading to storage:', storageFileName, 'Size:', fileSize);

        // Update progress to show uploading
        await supabase
          .from('download_jobs')
          .update({ 
            progress: 95,
            download_speed: 'Uploading...',
            eta: 'Final step'
          })
          .eq('id', jobId);
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('downloads')
          .upload(storageFileName, fileData, {
            contentType: getContentType(actualExtension),
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        console.log('Upload successful:', uploadData);

        // Generate download URL with longer expiry
        const { data: urlData } = await supabase.storage
          .from('downloads')
          .createSignedUrl(storageFileName, 7200); // 2 hours expiry

        if (!urlData?.signedUrl) {
          throw new Error('Failed to generate download URL');
        }

        const formattedFileSize = formatFileSize(fileSize);
        
        console.log('Download completed successfully');
        
        // Mark as completed with download URL
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

        // Clean up temporary file
        try {
          await Deno.remove(filePath);
          console.log('Temp file cleaned up');
        } catch (cleanupError) {
          console.warn('Failed to clean up temp file:', cleanupError);
        }

      } catch (error) {
        console.error('Download process failed:', error);
        await supabase
          .from('download_jobs')
          .update({ 
            status: 'failed',
            error_message: error.message,
            progress: 0,
            download_speed: null,
            eta: null
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

// Helper function to validate media files
function validateMediaFile(fileData: Uint8Array, format: string): boolean {
  // Check for common media file signatures
  const mp4Signature = [0x00, 0x00, 0x00]; // ftyp box for MP4
  const mp3Signature = [0xFF, 0xFB]; // MP3 frame header
  const mp3IDSignature = [0x49, 0x44, 0x33]; // ID3 tag for MP3
  
  if (format === 'audio') {
    // Check for MP3 signatures
    const hasMP3Header = fileData[0] === mp3Signature[0] && fileData[1] === mp3Signature[1];
    const hasID3Tag = fileData[0] === mp3IDSignature[0] && fileData[1] === mp3IDSignature[1] && fileData[2] === mp3IDSignature[2];
    return hasMP3Header || hasID3Tag;
  } else {
    // Check for MP4/video signatures (look for ftyp box within first 20 bytes)
    for (let i = 0; i < Math.min(20, fileData.length - 4); i++) {
      if (fileData[i] === 0x66 && fileData[i+1] === 0x74 && fileData[i+2] === 0x79 && fileData[i+3] === 0x70) {
        return true; // Found 'ftyp' signature
      }
    }
    return false;
  }
}

// Helper functions
function getContentType(extension: string): string {
  const ext = extension.toLowerCase();
  switch (ext) {
    case 'mp3': return 'audio/mpeg';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mkv': return 'video/x-matroska';
    case 'm4a': return 'audio/mp4';
    case 'wav': return 'audio/wav';
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
