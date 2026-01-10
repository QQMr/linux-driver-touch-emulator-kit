import React from 'react';
import {
  Play,
  Pause,
  RefreshCw,
  Circle,
  Square,
  Download,
  FileJson,
  PanelRightClose,
  PanelRightOpen,
  Sun,
  Moon
} from 'lucide-react';
import { DataSourceMode } from '../types';

interface ToolbarProps {
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  onReset: () => void;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onDownloadCsv: () => void;
  onDownloadJson: () => void;
  mode: DataSourceMode;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  isPlaying,
  setIsPlaying,
  onReset,
  isRecording,
  onStartRecording,
  onStopRecording,
  onDownloadCsv,
  onDownloadJson,
  mode,
  isSidebarOpen,
  setIsSidebarOpen,
  isDarkMode,
  setIsDarkMode
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Playback */}
      <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-1.5 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isPlaying
              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60'
              : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60'
          }`}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          {isPlaying ? 'Pause' : 'Resume'}
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <button
          onClick={onReset}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 rounded-md transition-colors"
          title="Reset"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Recording */}
      <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-1.5 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">
        {!isRecording ? (
          <button
            onClick={onStartRecording}
            disabled={mode === 'playback'}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === 'playback'
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                : 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40'
            }`}
          >
            <Circle size={16} className="fill-current" />
            Rec
          </button>
        ) : (
          <button
            onClick={onStopRecording}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            <Square size={16} className="fill-current" />
            Stop
          </button>
        )}
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <button
          onClick={onDownloadCsv}
          disabled={isRecording}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isRecording
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
              : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40'
          }`}
          title="Download CSV (Snapshot or Recording)"
        >
          <Download size={16} />
          CSV
        </button>
        <button
          onClick={onDownloadJson}
          disabled={isRecording}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isRecording
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
              : 'bg-teal-50 text-teal-600 hover:bg-teal-100 dark:bg-teal-900/20 dark:text-teal-400 dark:hover:bg-teal-900/40'
          }`}
          title="Download JSON (Snapshot or Recording)"
        >
          <FileJson size={16} />
          JSON
        </button>
      </div>

      {/* View & Theme Toggle */}
      <div className="bg-white dark:bg-gray-900 p-1.5 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 flex items-center gap-1 transition-colors">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`p-1.5 rounded-md transition-colors ${
            isSidebarOpen
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
          title="Toggle JSON Inspector"
        >
          {isSidebarOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
    </div>
  );
};
