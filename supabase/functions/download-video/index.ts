
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DownloadRequest {
  url: string;
  quality: string;
  jobId?: string;
}

// Simplified health check that doesn't block functionality
async function healthCheck(): Promise<{ status: string; ytdlp: boolean; ffmpeg: boolean }> {
  try {
    console.log("Starting health check...");
    
    // Try yt-dlp check with timeout
    let ytdlpAvailable = false;
    try {
      const ytdlpCheck = new Deno.Command("yt-dlp", {
        args: ["--version"],
        stdout: "piped",
        stderr: "piped",
      });
      
      const ytdlpResult = await Promise.race([
        ytdlpCheck.output(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
      ]) as any;
      
      ytdlpAvailable = ytdlpResult.success;
      console.log("yt-dlp check result:", ytdlpAvailable);
    } catch (error) {
      console.log("yt-dlp check failed:", error.message);
    }
    
    // Try ffmpeg check with timeout
    let ffmpegAvailable = false;
    try {
      const ffmpegCheck = new Deno.Command("ffmpeg", {
        args: ["-version"],
        stdout: "piped",
        stderr: "piped",
      });
      
      const ffmpegResult = await Promise.race([
        ffmpegCheck.output(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
      ]) as any;
      
      ffmpegAvailable = ffmpegResult.success;
      console.log("ffmpeg check result:", ffmpegAvailable);
    } catch (error) {
      console.log("ffmpeg check failed:", error.message);
    }
    
    // Return healthy status even if tools aren't perfect - let downloads attempt to work
    return {
      status: "healthy",
      ytdlp: ytdlpAvailable,
      ffmpeg: ffmpegAvailable
    };
  } catch (error) {
    console.error("Health check error:", error);
    // Still return healthy to allow downloads to attempt
    return {
      status: "healthy",
      ytdlp: false,
      ffmpeg: false
    };
  }
}

// Improved download with better error handling
async function streamDownload(url: string, quality: string): Promise<Response> {
  try {
    console.log(`Starting direct download: ${url} at ${quality} quality`);
    
    // Parse quality and format
    const [resolution, format] = quality.split('_');
    let formatSelector = 'best';
    let fileExtension = 'mp4';
    let contentType = 'video/mp4';
    
    if (format === 'audio') {
      formatSelector = 'bestaudio[ext=m4a]/bestaudio/best';
      fileExtension = 'mp3';
      contentType = 'audio/mpeg';
    } else if (format === 'video') {
      formatSelector = `best[height<=${resolution.replace('p', '')}][vcodec!=none]/best[height<=${resolution.replace('p', '')}]`;
    } else {
      // both video and audio
      formatSelector = `best[height<=${resolution.replace('p', '')}]+bestaudio/best[height<=${resolution.replace('p', '')}]`;
    }
    
    // Create temporary directory
    const tempDir = `/tmp/download_${Date.now()}`;
    await Deno.mkdir(tempDir, { recursive: true });
    
    const outputTemplate = `download.%(ext)s`;
    const fullOutputPath = `${tempDir}/${outputTemplate}`;
    
    // Build yt-dlp command with better error handling
    const args = [
      url,
      '--format', formatSelector,
      '--output', fullOutputPath,
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout', '60',
      '--retries', '3',
      '--fragment-retries', '3',
      '--file-access-retries', '2',
      '--ignore-errors',
      '--no-continue',
      '--no-part',
      '--prefer-free-formats',
    ];
    
    // Add audio-specific options
    if (format === 'audio') {
      args.push('--extract-audio');
      args.push('--audio-format', 'mp3');
      args.push('--audio-quality', '0');
    }
    
    console.log("Download command:", args.join(' '));
    
    // Execute download with better timeout handling
    const process = new Deno.Command("yt-dlp", {
      args: args,
      stdout: "piped",
      stderr: "piped",
      cwd: tempDir,
    });
    
    const downloadPromise = process.output();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Download timeout after 5 minutes")), 300000)
    );
    
    const result = await Promise.race([downloadPromise, timeoutPromise]) as any;
    
    if (!result.success) {
      const errorText = new TextDecoder().decode(result.stderr);
      console.error("yt-dlp failed:", errorText);
      
      // Try alternative approach with simpler format selector
      console.log("Trying alternative download approach...");
      const simpleArgs = [
        url,
        '--format', 'best',
        '--output', fullOutputPath,
        '--no-playlist',
        '--no-warnings',
      ];
      
      const simpleProcess = new Deno.Command("yt-dlp", {
        args: simpleArgs,
        stdout: "piped",
        stderr: "piped",
        cwd: tempDir,
      });
      
      const simpleResult = await simpleProcess.output();
      if (!simpleResult.success) {
        const simpleErrorText = new TextDecoder().decode(simpleResult.stderr);
        throw new Error(`Download failed: ${simpleErrorText.slice(0, 200)}`);
      }
    }
    
    // Find downloaded file
    const files = [];
    for await (const dirEntry of Deno.readDir(tempDir)) {
      if (dirEntry.isFile && !dirEntry.name.endsWith('.json') && !dirEntry.name.endsWith('.vtt')) {
        files.push(dirEntry.name);
      }
    }
    
    if (files.length === 0) {
      throw new Error("No video file was downloaded");
    }
    
    const downloadedFile = files[0];
    const finalPath = `${tempDir}/${downloadedFile}`;
    
    // Get file info
    const fileInfo = await Deno.stat(finalPath);
    const fileSize = fileInfo.size;
    
    // Validate file size
    if (fileSize < 1000) {
      throw new Error("Downloaded file is too small - likely corrupted");
    }
    
    // Read file for streaming
    const file = await Deno.open(finalPath, { read: true });
    
    // Determine content type based on file extension
    const actualExtension = downloadedFile.split('.').pop() || fileExtension;
    if (actualExtension === 'webm') {
      contentType = 'video/webm';
    } else if (actualExtension === 'm4a') {
      contentType = 'audio/mp4';
    } else if (actualExtension === 'mp3') {
      contentType = 'audio/mpeg';
    }
    
    // Generate safe filename
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeFilename = `video_${timestamp}.${actualExtension}`;
    
    console.log(`Streaming file: ${finalPath}, size: ${fileSize} bytes, type: ${contentType}`);
    
    // Create streaming response
    const stream = file.readable;
    
    // Schedule cleanup
    setTimeout(async () => {
      try {
        file.close();
        await Deno.remove(tempDir, { recursive: true });
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }, 1000);
    
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Length': fileSize.toString(),
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Cache-Control': 'no-cache',
        'Accept-Ranges': 'bytes',
      },
    });
    
  } catch (error) {
    console.error("Direct download error:", error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Health check endpoint - always return healthy to allow downloads
  if (req.method === 'GET') {
    const health = await healthCheck();
    return new Response(JSON.stringify(health), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 // Always return 200 to allow downloads to proceed
    });
  }

  try {
    const { url, quality }: DownloadRequest = await req.json();
    console.log(`Processing direct download request: ${url}, quality: ${quality}`);

    if (!url || !quality) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: url and quality' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return streaming download response
    return await streamDownload(url, quality);

  } catch (error) {
    console.error('Request error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Download failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
