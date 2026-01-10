import React from 'react';
import { SlidersHorizontal, Hash, Grid3x3, MousePointer2, Activity } from 'lucide-react';
import { TrailStyle, DataSourceMode } from '../types';

const TRAIL_STYLES: TrailStyle[] = ['solid', 'dashed', 'dotted', 'fade'];

interface ControlPanelProps {
  mode: DataSourceMode;
  touchPointSize: number;
  setTouchPointSize: (size: number) => void;
  touchPointCount: number;
  setTouchPointCount: (count: number) => void;
  showMatrix: boolean;
  setShowMatrix: (show: boolean) => void;
  showTouchPoints: boolean;
  setShowTouchPoints: (show: boolean) => void;
  showTrails: boolean;
  setShowTrails: (show: boolean) => void;
  trailStyle: TrailStyle;
  setTrailStyle: (style: TrailStyle) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  mode,
  touchPointSize,
  setTouchPointSize,
  touchPointCount,
  setTouchPointCount,
  showMatrix,
  setShowMatrix,
  showTouchPoints,
  setShowTouchPoints,
  showTrails,
  setShowTrails,
  trailStyle,
  setTrailStyle
}) => {
  return (
    <div className="bg-white dark:bg-gray-900 p-3 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row gap-4 items-center transition-colors">
      {/* Size Slider */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <SlidersHorizontal size={16} />
          <span className="text-xs font-medium uppercase tracking-wider">Size</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.1"
            value={touchPointSize}
            onChange={(e) => setTouchPointSize(parseFloat(e.target.value))}
            className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs font-mono w-8 text-gray-600 dark:text-gray-300">
            {touchPointSize.toFixed(1)}x
          </span>
        </div>
      </div>

      <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 hidden md:block" />

      {/* Visual Toggles Group */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-md transition-colors">
        <button
          onClick={() => setShowMatrix(!showMatrix)}
          className={`p-1.5 rounded-md transition-colors ${
            showMatrix
              ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title="Toggle Matrix Heatmap"
        >
          <Grid3x3 size={16} />
        </button>
        <button
          onClick={() => setShowTouchPoints(!showTouchPoints)}
          className={`p-1.5 rounded-md transition-colors ${
            showTouchPoints
              ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title="Toggle Touch Points"
        >
          <MousePointer2 size={16} />
        </button>
        <button
          onClick={() => setShowTrails(!showTrails)}
          disabled={!showTouchPoints}
          className={`p-1.5 rounded-md transition-colors ${
            showTrails
              ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
          } ${!showTouchPoints ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Toggle Movement Trails"
        >
          <Activity size={16} />
        </button>
      </div>

      {/* Trail Style Slider */}
      {showTrails && (
        <>
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 hidden md:block" />
          <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="text-xs font-medium uppercase tracking-wider">Style</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="3"
                step="1"
                value={TRAIL_STYLES.indexOf(trailStyle)}
                onChange={(e) => setTrailStyle(TRAIL_STYLES[parseInt(e.target.value)])}
                className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs font-mono w-12 text-gray-600 dark:text-gray-300 uppercase text-center">
                {trailStyle}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Point Count Slider (Simulation Mode Only) */}
      {mode === 'simulation' && (
        <>
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 hidden md:block" />
          <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Hash size={16} />
              <span className="text-xs font-medium uppercase tracking-wider">Count</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={touchPointCount}
                onChange={(e) => setTouchPointCount(parseInt(e.target.value))}
                className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs font-mono w-4 text-gray-600 dark:text-gray-300">
                {touchPointCount}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
