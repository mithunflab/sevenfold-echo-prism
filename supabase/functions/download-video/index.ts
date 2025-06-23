
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DownloadRequest {
  url: string;
  quality: string;
  jobId: string;
}

// Phase 1: Environment & Tool Validation
async function validateYtDlp(): Promise<boolean> {
  try {
    const process = new Deno.Command("yt-dlp", {
      args: ["--version"],
      stdout: "piped",
      stderr: "piped",
    });
    
    const { success } = await process.output();
    return success;
  } catch (error) {
    console.error("yt-dlp validation failed:", error);
    return false;
  }
}

async function installYtDlp(): Promise<boolean> {
  try {
    console.log("Installing yt-dlp...");
    const process = new Deno.Command("pip", {
      args: ["install", "yt-dlp"],
      stdout: "piped",
      stderr: "piped",
    });
    
    const { success } = await process.output();
    console.log("yt-dlp installation result:", success);
    return success;
  } catch (error) {
    console.error("Failed to install yt-dlp:", error);
    return false;
  }
}

// Phase 3: File Verification & Storage
function validateFileIntegrity(filePath: string): { isValid: boolean; fileSize: number; error?: string } {
  try {
    const fileInfo = Deno.statSync(filePath);
    const fileSize = fileInfo.size;
    
    // Critical: Check if file is too small (likely corrupted)
    if (fileSize < 1024) { // Less than 1KB is definitely corrupted
      return { isValid: false, fileSize, error: "File too small - likely corrupted" };
    }
    
    // Read first few bytes to check file headers
    const file = Deno.openSync(filePath, { read: true });
    const buffer = new Uint8Array(12);
    const bytesRead = file.readSync(buffer);
    file.close();
    
    if (bytesRead === null || bytesRead < 4) {
      return { isValid: false, fileSize, error: "Cannot read file headers" };
    }
    
    // Check for common video/audio file signatures
    const isMP4 = buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70; // ftyp
    const isWebM = buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3; // WebM
    const isMP3 = (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) || // MP3 frame header
                  (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33); // ID3 tag
    
    if (!isMP4 && !isWebM && !isMP3) {
      return { isValid: false, fileSize, error: "Invalid file format - not a recognized video/audio file" };
    }
    
    return { isValid: true, fileSize };
  } catch (error) {
    return { isValid: false, fileSize: 0, error: `File validation error: ${error.message}` };
  }
}

// Phase 2: Download Process Improvements
async function downloadWithYtDlp(url: string, quality: string, outputPath: string, supabase: any, jobId: string): Promise<{ success: boolean; filePath?: string; error?: string; fileSize?: number }> {
  try {
    console.log(`Starting download: ${url} at ${quality} quality`);
    
    // Enhanced format selection based on quality and type
    const [resolution, format] = quality.split('_');
    let formatSelector = 'best';
    
    if (format === 'audio') {
      formatSelector = 'bestaudio/best';
    } else if (format === 'video') {
      formatSelector = `best[height<=${resolution.replace('p', '')}][vcodec!=none]`;
    } else {
      // both video and audio
      formatSelector = `best[height<=${resolution.replace('p', '')}]`;
    }
    
    const fileName = `video_${Date.now()}.%(ext)s`;
    const fullOutputPath = `${outputPath}/${fileName}`;
    
    // Enhanced yt-dlp command with better error handling and timeouts
    const args = [
      url,
      '--format', formatSelector,
      '--output', fullOutputPath,
      '--no-playlist',
      '--extract-flat', 'false',
      '--write-info-json',
      '--no-warnings',
      '--socket-timeout', '30',
      '--retries', '3',
      '--fragment-retries', '3',
    ];
    
    if (format === 'audio') {
      args.push('--extract-audio', '--audio-format', 'mp3');
    }
    
    console.log("yt-dlp command:", args.join(' '));
    
    const process = new Deno.Command("yt-dlp", {
      args: args,
      stdout: "piped",
      stderr: "piped",
      cwd: outputPath,
    });
    
    // Phase 2: Implement timeout handling
    const downloadPromise = process.output();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Download timeout after 5 minutes")), 300000)
    );
    
    const result = await Promise.race([downloadPromise, timeoutPromise]) as any;
    
    if (!result.success) {
      const errorText = new TextDecoder().decode(result.stderr);
      console.error("yt-dlp failed:", errorText);
      
      // Update job status with specific error
      await supabase.from('download_jobs').update({
        status: 'failed',
        error_message: `Download failed: ${errorText.slice(0, 200)}`
      }).eq('id', jobId);
      
      return { success: false, error: errorText };
    }
    
    // Find the downloaded file
    const files = [];
    for await (const dirEntry of Deno.readDir(outputPath)) {
      if (dirEntry.isFile && !dirEntry.name.endsWith('.json')) {
        files.push(dirEntry.name);
      }
    }
    
    if (files.length === 0) {
      const error = "No video file was downloaded";
      await supabase.from('download_jobs').update({
        status: 'failed',
        error_message: error
      }).eq('id', jobId);
      return { success: false, error };
    }
    
    const downloadedFile = files[0];
    const finalPath = `${outputPath}/${downloadedFile}`;
    
    // Phase 3: Critical file integrity validation
    const validation = validateFileIntegrity(finalPath);
    if (!validation.isValid) {
      console.error("File integrity check failed:", validation.error);
      
      // Clean up corrupted file
      try {
        Deno.removeSync(finalPath);
      } catch (e) {
        console.error("Failed to remove corrupted file:", e);
      }
      
      await supabase.from('download_jobs').update({
        status: 'failed',
        error_message: `File integrity check failed: ${validation.error}`
      }).eq('id', jobId);
      
      return { success: false, error: validation.error };
    }
    
    console.log(`Download successful: ${finalPath}, size: ${validation.fileSize} bytes`);
    return { success: true, filePath: finalPath, fileSize: validation.fileSize };
    
  } catch (error) {
    console.error("Download error:", error);
    const errorMessage = error.message || "Unknown download error";
    
    await supabase.from('download_jobs').update({
      status: 'failed',
      error_message: errorMessage.slice(0, 200)
    }).eq('id', jobId);
    
    return { success: false, error: errorMessage };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { url, quality, jobId }: DownloadRequest = await req.json()
    console.log(`Processing download request: ${url}, quality: ${quality}, jobId: ${jobId}`)

    if (!url || !quality || !jobId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Phase 1: Validate yt-dlp installation
    let ytDlpAvailable = await validateYtDlp();
    if (!ytDlpAvailable) {
      console.log("yt-dlp not available, attempting installation...");
      ytDlpAvailable = await installYtDlp();
      
      if (!ytDlpAvailable) {
        await supabaseClient.from('download_jobs').update({
          status: 'failed',
          error_message: 'Video downloader is not available. Please try again later.'
        }).eq('id', jobId);
        
        return new Response(
          JSON.stringify({ error: 'Video downloader unavailable' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Update job status to downloading
    await supabaseClient.from('download_jobs').update({
      status: 'downloading',
      progress: 0
    }).eq('id', jobId)

    // Create temporary directory
    const tempDir = `/tmp/download_${jobId}`
    await Deno.mkdir(tempDir, { recursive: true })

    try {
      // Phase 2 & 3: Enhanced download with validation
      const downloadResult = await downloadWithYtDlp(url, quality, tempDir, supabaseClient, jobId);
      
      if (!downloadResult.success) {
        return new Response(
          JSON.stringify({ error: downloadResult.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Upload to Supabase Storage with proper content type
      const fileData = await Deno.readFile(downloadResult.filePath!);
      const fileName = `${jobId}_${Date.now()}.${downloadResult.filePath!.split('.').pop()}`;
      
      // Determine content type based on file extension and format
      let contentType = 'video/mp4';
      if (quality.includes('audio')) {
        contentType = 'audio/mpeg';
      } else if (downloadResult.filePath!.endsWith('.webm')) {
        contentType = 'video/webm';
      }
      
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('videos')
        .upload(fileName, fileData, {
          contentType,
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Failed to upload file: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabaseClient.storage
        .from('videos')
        .getPublicUrl(fileName);

      // Format file size
      const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };

      // Update job as completed with file info
      await supabaseClient.from('download_jobs').update({
        status: 'completed',
        progress: 100,
        download_url: urlData.publicUrl,
        file_size: formatFileSize(downloadResult.fileSize || 0)
      }).eq('id', jobId)

      // Cleanup
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          downloadUrl: urlData.publicUrl,
          fileSize: formatFileSize(downloadResult.fileSize || 0)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } catch (error) {
      console.error('Processing error:', error);
      
      // Cleanup on error
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }

      await supabaseClient.from('download_jobs').update({
        status: 'failed',
        error_message: error.message?.slice(0, 200) || 'Processing failed'
      }).eq('id', jobId);

      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Request error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
