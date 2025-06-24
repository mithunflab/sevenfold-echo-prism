
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DownloadRequest {
  url: string;
  mode: 'video' | 'audio' | 'both';
}

// Simple and reliable download function matching your Python logic
async function downloadVideo(url: string, mode: string): Promise<Response> {
  try {
    console.log(`Starting download: ${url} with mode: ${mode}`);
    
    // Create unique temp directory
    const tempDir = `/tmp/yt_download_${Date.now()}`;
    await Deno.mkdir(tempDir, { recursive: true });
    
    // Build yt-dlp options based on mode (matching your Python code)
    const args = [url];
    let outputTemplate = 'downloads/%(title)s.%(ext)s';
    
    if (mode === "video") {
      args.push('--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best');
    } else if (mode === "audio") {
      args.push('--format', 'bestaudio[ext=m4a]/bestaudio');
      args.push('--extract-audio');
      args.push('--audio-format', 'mp3');
      args.push('--audio-quality', '192');
    } else { // both
      args.push('--format', 'bestvideo+bestaudio/best');
    }
    
    args.push('--output', `${tempDir}/${outputTemplate}`);
    args.push('--no-playlist');
    args.push('--no-warnings');
    
    console.log('Executing yt-dlp with args:', args);
    
    // Run yt-dlp command
    const process = new Deno.Command("yt-dlp", {
      args: args,
      stdout: "piped",
      stderr: "piped",
      cwd: tempDir,
    });
    
    const result = await process.output();
    const stdout = new TextDecoder().decode(result.stdout);
    const stderr = new TextDecoder().decode(result.stderr);
    
    console.log('yt-dlp stdout:', stdout);
    console.log('yt-dlp stderr:', stderr);
    
    if (!result.success) {
      throw new Error(`Download failed: ${stderr}`);
    }
    
    // Find the downloaded file
    const downloadDir = `${tempDir}/downloads`;
    let downloadedFile = '';
    
    try {
      for await (const dirEntry of Deno.readDir(downloadDir)) {
        if (dirEntry.isFile && (
          dirEntry.name.endsWith('.mp4') || 
          dirEntry.name.endsWith('.mp3') || 
          dirEntry.name.endsWith('.webm') ||
          dirEntry.name.endsWith('.m4a')
        )) {
          downloadedFile = dirEntry.name;
          break;
        }
      }
    } catch (error) {
      console.error('Error reading download directory:', error);
      throw new Error('Downloaded file not found');
    }
    
    if (!downloadedFile) {
      throw new Error('No downloaded file found');
    }
    
    const filePath = `${downloadDir}/${downloadedFile}`;
    console.log('Found downloaded file:', filePath);
    
    // Read the file
    const fileData = await Deno.readFile(filePath);
    
    // Determine content type
    let contentType = 'application/octet-stream';
    if (downloadedFile.endsWith('.mp4')) contentType = 'video/mp4';
    else if (downloadedFile.endsWith('.mp3')) contentType = 'audio/mpeg';
    else if (downloadedFile.endsWith('.webm')) contentType = 'video/webm';
    else if (downloadedFile.endsWith('.m4a')) contentType = 'audio/mp4';
    
    // Clean up temp directory
    setTimeout(async () => {
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }, 1000);
    
    // Return file as response
    return new Response(fileData, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${downloadedFile}"`,
        'Content-Length': fileData.length.toString(),
      },
    });
    
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Simple health check
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ status: 'healthy', message: 'Download service is ready' }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  }

  // Handle download request
  if (req.method === 'POST') {
    try {
      const requestBody = await req.text();
      console.log('Received request body:', requestBody);
      
      if (!requestBody) {
        throw new Error('Empty request body');
      }
      
      const { url, mode }: DownloadRequest = JSON.parse(requestBody);
      
      if (!url) {
        return new Response(
          JSON.stringify({ error: 'URL is required' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      console.log(`Processing download: ${url}, mode: ${mode}`);
      return await downloadVideo(url, mode || 'both');
      
    } catch (error) {
      console.error('Request processing error:', error);
      return new Response(
        JSON.stringify({ 
          error: error.message || 'Download failed',
          details: 'Please check the URL and try again'
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
});
