
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
          '--progress'
        ];

        let outputTemplate = '/tmp/%(title)s.%(ext)s';
        let expectedExtension = 'mp4';

        // Set format based on user selection with proper yt-dlp syntax
        if (format === 'audio') {
          // Audio only - extract best audio and convert to mp3
          ytDlpArgs.push(
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '192K',
            '--format', 'bestaudio/best'
          );
          outputTemplate = '/tmp/%(title)s.%(ext)s';
          expectedExtension = 'mp3';
        } else if (format === 'video') {
          // Video only - no audio track
          const maxHeight = resolution.replace('p', '');
          ytDlpArgs.push(
            '--format', `best[height<=${maxHeight}][vcodec!=none][acodec=none]/best[height<=${maxHeight}]`
          );
          expectedExtension = 'mp4';
        } else { // both - video + audio
          const maxHeight = resolution.replace('p', '');
          ytDlpArgs.push(
            '--format', `best[height<=${maxHeight}]/best`
          );
          expectedExtension = 'mp4';
        }

        ytDlpArgs.push('--output', outputTemplate);
        ytDlpArgs.push(url);

        console.log('yt-dlp command:', ['yt-dlp', ...ytDlpArgs]);

        // Execute yt-dlp
        const process = new Deno.Command('yt-dlp', {
          args: ytDlpArgs,
          stdout: 'piped',
          stderr: 'piped'
        });

        const child = process.spawn();
        const decoder = new TextDecoder();
        let downloadProgress = 5;
        let lastUpdateTime = Date.now();

        // Read progress from yt-dlp output with better parsing
        const reader = child.stdout.getReader();
        const errorReader = child.stderr.getReader();

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
              const newProgress = Math.min(parseFloat(progressMatch[1]), 95);
              
              // Only update if significant change or enough time passed
              if (newProgress > downloadProgress + 2 || Date.now() - lastUpdateTime > 3000) {
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

            // Check for extraction/processing messages
            if (output.includes('[ExtractAudio]') || output.includes('Extracting audio')) {
              await supabase
                .from('download_jobs')
                .update({ 
                  progress: Math.max(downloadProgress, 90),
                  download_speed: 'Processing audio...',
                  eta: 'Almost done'
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
            
            if (isTargetFormat && !fileName.startsWith('.')) {
              files.push(fileName);
              console.log('Found file:', fileName);
            }
          }
        }

        if (files.length === 0) {
          throw new Error('No downloaded file found');
        }

        // Use the first matching file
        const fileName = files[0];
        const filePath = `/tmp/${fileName}`;
        
        console.log('Reading file:', filePath);
        
        // Read the downloaded file
        const fileData = await Deno.readFile(filePath);
        const fileSize = fileData.length;
        
        // Generate a unique filename for storage
        const timestamp = Date.now();
        const actualExtension = fileName.split('.').pop() || expectedExtension;
        const storageFileName = `${format}_${jobId}_${timestamp}.${actualExtension}`;
        
        console.log('Uploading to storage:', storageFileName);

        // Update progress to show uploading
        await supabase
          .from('download_jobs')
          .update({ 
            progress: 98,
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
