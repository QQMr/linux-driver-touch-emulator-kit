import React, { useRef } from 'react';
import { Cpu, Globe, Film, Upload, AlertCircle, SkipBack, SkipForward } from 'lucide-react';
import { DataSourceMode, Frame } from '../types';

interface ModeSelectorProps {
  mode: DataSourceMode;
  setMode: (mode: DataSourceMode) => void;
  url: string;
  setUrl: (url: string) => void;
  fetchError: string | null;
  playbackData: Frame[];
  playbackIndex: number;
  setPlaybackIndex: (index: number) => void;
  onFileUpload: (file: File) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  mode,
  setMode,
  url,
  setUrl,
  fetchError,
  playbackData,
  playbackIndex,
  setPlaybackIndex,
  onFileUpload
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
    event.target.value = '';
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-3 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row gap-4 items-center transition-colors">
      <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-md shrink-0 transition-colors">
        <button
          onClick={() => setMode('simulation')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-medium transition-all ${
            mode === 'simulation'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <Cpu size={16} />
          Simulation
        </button>
        <button
          onClick={() => setMode('url')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-medium transition-all ${
            mode === 'url'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <Globe size={16} />
          URL Fetch
        </button>
        <button
          onClick={() => setMode('playback')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-medium transition-all ${
            mode === 'playback'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <Film size={16} />
          Playback
        </button>
      </div>

      {mode === 'url' && (
        <div className="flex-1 w-full flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-300">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/data"
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
          {fetchError && (
            <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium whitespace-nowrap">
              <AlertCircle size={14} />
              {fetchError}
            </div>
          )}
        </div>
      )}

      {mode === 'playback' && (
        <div className="flex-1 w-full flex flex-col sm:flex-row items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-300">
          {/* File Input */}
          <div className="relative group">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 whitespace-nowrap transition-colors"
            >
              <Upload size={14} />
              {playbackData.length > 0 ? 'Change File' : 'Upload JSON'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {playbackData.length > 0 && (
            <div className="flex-1 w-full flex items-center gap-3 bg-gray-50 dark:bg-gray-800 px-3 py-1 rounded-md border border-gray-200 dark:border-gray-700 transition-colors">
              <div className="text-xs font-mono text-gray-500 dark:text-gray-400 w-24 whitespace-nowrap">
                Frame {playbackIndex + 1}/{playbackData.length}
              </div>
              <div className="flex-1 flex items-center gap-2">
                <SkipBack
                  size={14}
                  className="text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300"
                  onClick={() => setPlaybackIndex(0)}
                />
                <input
                  type="range"
                  min="0"
                  max={playbackData.length - 1}
                  value={playbackIndex}
                  onChange={(e) => setPlaybackIndex(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <SkipForward
                  size={14}
                  className="text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300"
                  onClick={() => setPlaybackIndex(playbackData.length - 1)}
                />
              </div>
            </div>
          )}

          {fetchError && (
            <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium whitespace-nowrap">
              <AlertCircle size={14} />
              {fetchError}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
