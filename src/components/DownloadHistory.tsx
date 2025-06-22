
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

interface DownloadJob {
  id: string;
  video_title: string | null;
  video_thumbnail: string | null;
  video_uploader: string | null;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  quality: string;
  created_at: string;
  error_message: string | null;
}

interface DownloadHistoryProps {
  jobs: DownloadJob[];
}

const DownloadHistory: React.FC<DownloadHistoryProps> = ({ jobs }) => {
  if (jobs.length === 0) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'downloading':
        return <Download className="w-5 h-5 text-blue-400 animate-pulse" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-400" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'downloading':
        return 'Downloading';
      case 'pending':
        return 'Pending';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  return (
    <Card className="p-6 bg-gray-800/50 border-gray-700 backdrop-blur-sm">
      <h3 className="text-white font-semibold text-lg mb-4 flex items-center">
        <Clock className="w-5 h-5 mr-2" />
        Download History
      </h3>
      
      <div className="space-y-3">
        {jobs.map((job) => (
          <div key={job.id} className="flex items-center space-x-4 p-3 bg-gray-900/30 rounded-lg">
            <img 
              src={job.video_thumbnail || '/placeholder.svg'} 
              alt={job.video_title || 'Video'}
              className="w-16 h-12 object-cover rounded flex-shrink-0"
            />
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                {getStatusIcon(job.status)}
                <span className="text-sm text-gray-400">
                  {getStatusText(job.status)}
                </span>
                {job.status === 'downloading' && (
                  <span className="text-sm text-blue-400">
                    {job.progress.toFixed(1)}%
                  </span>
                )}
              </div>
              
              <h4 className="text-white font-medium text-sm truncate">
                {job.video_title || 'Unknown Title'}
              </h4>
              
              <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
                <span>{job.video_uploader}</span>
                <span>{job.quality}</span>
                <span>{new Date(job.created_at).toLocaleDateString()}</span>
              </div>
              
              {job.error_message && (
                <p className="text-red-400 text-xs mt-1">{job.error_message}</p>
              )}
            </div>
            
            {job.status === 'completed' && (
              <Button
                variant="outline"
                size="sm"
                className="bg-gray-700/50 border-gray-600 text-white hover:bg-gray-600/50"
                onClick={() => {
                  // In a real implementation, this would trigger the file download
                  console.log('Download file:', job.id);
                }}
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

export default DownloadHistory;
