
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

// Health check endpoint
async function healthCheck(): Promise<{ status: string; ytdlp: boolean; ffmpeg: boolean }> {
  try {
    const ytdlpCheck = new Deno.Command("yt-dlp", {
      args: ["--version"],
      stdout: "piped",
      stderr: "piped",
    });
    
    const ffmpegCheck = new Deno.Command("ffmpeg", {
      args: ["-version"],
      stdout: "piped",
      stderr: "piped",
    });
    
    const [ytdlpResult, ffmpegResult] = await Promise.all([
      ytdlpCheck.output(),
      ffmpegCheck.output()
    ]);
    
    return {
      status: "healthy",
      ytdlp: ytdlpResult.success,
      ffmpeg: ffmpegResult.success
    };
  } catch (error) {
    console.error("Health check failed:", error);
    return {
      status: "unhealthy",
      ytdlp: false,
      ffmpeg: false
    };
  }
}

// Validate file integrity with magic number checks
function validateFileIntegrity(filePath: string): { isValid: boolean; fileSize: number; fileType: string; error?: string } {
  try {
    const fileInfo = Deno.statSync(filePath);
    const fileSize = fileInfo.size;
    
    // Critical: Check minimum file size (1MB for videos, 100KB for audio)
    if (fileSize < 100000) { // Less than 100KB is likely corrupted
      return { isValid: false, fileSize, fileType: 'unknown', error: "File too small - likely corrupted" };
    }
    
    // Read file headers for magic number validation
    const file = Deno.openSync(filePath, { read: true });
    const buffer = new Uint8Array(20);
    const bytesRead = file.readSync(buffer);
    file.close();
    
    if (bytesRead === null || bytesRead < 8) {
      return { isValid: false, fileSize, fileType: 'unknown', error: "Cannot read file headers" };
    }
    
    // Enhanced magic number checks
    let fileType = 'unknown';
    let isValid = false;
    
    // MP4 signatures
    if ((buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) || // ftyp
        (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 && buffer[3] === 0x18) || // MP4 box
        (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 && buffer[3] === 0x20)) {   // MP4 box
      fileType = 'mp4';
      isValid = true;
    }
    // WebM signature
    else if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
      fileType = 'webm';
      isValid = true;
    }
    // MP3 signatures
    else if ((buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) || // MP3 frame header
             (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)) { // ID3 tag
      fileType = 'mp3';
      isValid = true;
    }
    // M4A signature
    else if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70 &&
             (buffer[8] === 0x4D || buffer[8] === 0x69)) { // M4A variants
      fileType = 'm4a';
      isValid = true;
    }
    
    if (!isValid) {
      return { isValid: false, fileSize, fileType, error: "Invalid file format - not a recognized video/audio file" };
    }
    
    return { isValid: true, fileSize, fileType };
  } catch (error) {
    return { isValid: false, fileSize: 0, fileType: 'unknown', error: `File validation error: ${error.message}` };
  }
}

// Enhanced download function with proper validation
async function downloadWithYtDlp(url: string, quality: string, outputPath: string, supabase: any, jobId: string): Promise<{ success: boolean; filePath?: string; error?: string; fileSize?: number; fileType?: string }> {
  try {
    console.log(`Starting enhanced download: ${url} at ${quality} quality`);
    
    // Phase 1: Health check
    const health = await healthCheck();
    if (!health.ytdlp) {
      throw new Error("yt-dlp is not available in this environment");
    }
    
    // Update job status
    await supabase.from('download_jobs').update({
      status: 'downloading',
      progress: 5
    }).eq('id', jobId);
    
    // Phase 2: Parse quality and format
    const [resolution, format] = quality.split('_');
    let formatSelector = 'best';
    let outputTemplate = 'video_%(id)s.%(ext)s';
    
    if (format === 'audio') {
      formatSelector = 'bestaudio[ext=m4a]/bestaudio/best';
      outputTemplate = 'audio_%(id)s.%(ext)s';
    } else if (format === 'video') {
      formatSelector = `best[height<=${resolution.replace('p', '')}][vcodec!=none]/best[height<=${resolution.replace('p', '')}]`;
    } else {
      // both video and audio
      formatSelector = `best[height<=${resolution.replace('p', '')}]+bestaudio/best[height<=${resolution.replace('p', '')}]`;
    }
    
    const fullOutputPath = `${outputPath}/${outputTemplate}`;
    
    // Phase 3: Enhanced yt-dlp command
    const args = [
      url,
      '--format', formatSelector,
      '--output', fullOutputPath,
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout', '60',
      '--retries', '5',
      '--fragment-retries', '5',
      '--file-access-retries', '3',
      '--embed-subs',
      '--write-auto-sub',
      '--sub-lang', 'en,en-US',
      '--ignore-errors',
      '--no-continue',
      '--no-part',
    ];
    
    // Add audio-specific options
    if (format === 'audio') {
      args.push('--extract-audio');
      args.push('--audio-format', 'mp3');
      args.push('--audio-quality', '0'); // Best quality
    }
    
    console.log("Enhanced yt-dlp command:", args.join(' '));
    
    // Update progress
    await supabase.from('download_jobs').update({
      progress: 10
    }).eq('id', jobId);
    
    // Phase 4: Execute download with timeout
    const process = new Deno.Command("yt-dlp", {
      args: args,
      stdout: "piped",
      stderr: "piped",
      cwd: outputPath,
    });
    
    const downloadPromise = process.output();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Download timeout after 10 minutes")), 600000)
    );
    
    const result = await Promise.race([downloadPromise, timeoutPromise]) as any;
    
    if (!result.success) {
      const errorText = new TextDecoder().decode(result.stderr);
      console.error("yt-dlp failed:", errorText);
      
      await supabase.from('download_jobs').update({
        status: 'failed',
        error_message: `Download failed: ${errorText.slice(0, 200)}`
      }).eq('id', jobId);
      
      return { success: false, error: errorText };
    }
    
    // Update progress
    await supabase.from('download_jobs').update({
      progress: 80
    }).eq('id', jobId);
    
    // Phase 5: Find and validate downloaded file
    const files = [];
    for await (const dirEntry of Deno.readDir(outputPath)) {
      if (dirEntry.isFile && !dirEntry.name.endsWith('.json') && !dirEntry.name.endsWith('.vtt')) {
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
    
    // Phase 6: Critical file integrity validation
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
    
    // Update progress
    await supabase.from('download_jobs').update({
      progress: 95
    }).eq('id', jobId);
    
    console.log(`Download successful: ${finalPath}, size: ${validation.fileSize} bytes, type: ${validation.fileType}`);
    return { 
      success: true, 
      filePath: finalPath, 
      fileSize: validation.fileSize, 
      fileType: validation.fileType 
    };
    
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Health check endpoint
  if (req.method === 'GET' && new URL(req.url).pathname === '/health') {
    const health = await healthCheck();
    return new Response(JSON.stringify(health), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: health.status === 'healthy' ? 200 : 503
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { url, quality, jobId }: DownloadRequest = await req.json();
    console.log(`Processing enhanced download request: ${url}, quality: ${quality}, jobId: ${jobId}`);

    if (!url || !quality || !jobId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Phase 1: Environment validation
    const health = await healthCheck();
    if (!health.ytdlp || !health.ffmpeg) {
      await supabaseClient.from('download_jobs').update({
        status: 'failed',
        error_message: 'Download environment is not properly configured. yt-dlp or ffmpeg unavailable.'
      }).eq('id', jobId);
      
      return new Response(
        JSON.stringify({ error: 'Download environment unavailable', health }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create temporary directory
    const tempDir = `/tmp/download_${jobId}`;
    await Deno.mkdir(tempDir, { recursive: true });

    try {
      // Phase 2: Enhanced download with validation
      const downloadResult = await downloadWithYtDlp(url, quality, tempDir, supabaseClient, jobId);
      
      if (!downloadResult.success) {
        return new Response(
          JSON.stringify({ error: downloadResult.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Phase 3: Upload to Supabase Storage with proper content type
      const fileData = await Deno.readFile(downloadResult.filePath!);
      const fileName = `${jobId}_${Date.now()}.${downloadResult.fileType}`;
      
      // Determine content type based on validated file type
      let contentType = 'application/octet-stream';
      switch (downloadResult.fileType) {
        case 'mp4':
          contentType = 'video/mp4';
          break;
        case 'webm':
          contentType = 'video/webm';
          break;
        case 'mp3':
          contentType = 'audio/mpeg';
          break;
        case 'm4a':
          contentType = 'audio/mp4';
          break;
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

      // Update job as completed
      await supabaseClient.from('download_jobs').update({
        status: 'completed',
        progress: 100,
        download_url: urlData.publicUrl,
        file_size: formatFileSize(downloadResult.fileSize || 0)
      }).eq('id', jobId);

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
          fileSize: formatFileSize(downloadResult.fileSize || 0),
          fileType: downloadResult.fileType
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

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
      );
    }

  } catch (error) {
    console.error('Request error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
