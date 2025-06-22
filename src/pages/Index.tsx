
import VideoDownloader from '@/components/VideoDownloader';

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-red-500 to-purple-600 bg-clip-text text-transparent">
            YouTube Video Scraper
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Professional real-time video downloader powered by yt-dlp. 
            Enter any YouTube URL and download videos with live progress tracking.
          </p>
        </div>
        <VideoDownloader />
      </div>
    </div>
  );
};

export default Index;
