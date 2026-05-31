import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DataCanvas } from './components/DataCanvas';
import { JsonTreeView } from './components/JsonTreeView';
import { Toolbar } from './components/Toolbar';
import { ModeSelector } from './components/ModeSelector';
import { ControlPanel } from './components/ControlPanel';
import { useDataSource } from './hooks/useDataSource';
import { useRecording } from './hooks/useRecording';
import { useTouchPoints } from './hooks/useTouchPoints';
import { UPDATE_INTERVAL_MS } from './constants';
import { Brackets } from 'lucide-react';
import { TrailStyle } from './types';

export default function App() {
  // Custom Hooks
  const dataSource = useDataSource();
  const recording = useRecording();
  const touchPoints = useTouchPoints(3);

  // Visual Settings State
  const [touchPointSize, setTouchPointSize] = useState(1.0);
  const [touchPointCount, setTouchPointCount] = useState(3);
  const [showTrails, setShowTrails] = useState(false);
  const [trailStyle, setTrailStyle] = useState<TrailStyle>('fade');
  const [showMatrix, setShowMatrix] = useState(true);
  const [showTouchPoints, setShowTouchPoints] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // UI State
  const [debugData, setDebugData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [fps, setFps] = useState(0);

  // Refs for FPS calculation
  const framesRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const touchPointCountRef = useRef(touchPointCount);

  // Sync touchPointCount ref
  useEffect(() => {
    touchPointCountRef.current = touchPointCount;
  }, [touchPointCount]);

  // Handle Dark Mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Store refs to avoid stale closures in interval
  const dataSourceRef = useRef(dataSource);
  const touchPointsRef = useRef(touchPoints);
  const recordingRef = useRef(recording);

  useEffect(() => {
    dataSourceRef.current = dataSource;
    touchPointsRef.current = touchPoints;
    recordingRef.current = recording;
  }, [dataSource, touchPoints, recording]);

  // Main Update Logic - stable callback using refs
  const handleUpdate = useCallback(async () => {
    const ds = dataSourceRef.current;
    const tp = touchPointsRef.current;
    const rec = recordingRef.current;

    const result = await ds.handleUpdate();

    tp.updateTouchPoints(result.touchPoints || []);

    if (result.debugData) {
      setDebugData(result.debugData);
    }

    // Recording (don't record during playback)
    if (result.matrix && ds.mode !== 'playback') {
      rec.recordFrame(result.matrix, result.touchPoints, result.message);
    }

    setLastUpdateTime(Date.now());

    // Calculate FPS
    const now = Date.now();
    framesRef.current++;
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(framesRef.current);
      framesRef.current = 0;
      lastFpsTimeRef.current = now;
    }
  }, []); // No dependencies - uses refs

  // SSE callback for URL mode - handles data updates from server
  useEffect(() => {
    if (dataSource.mode === 'url' && dataSource.useSSE) {
      dataSource.setOnData((result) => {
        const tp = touchPointsRef.current;
        const rec = recordingRef.current;

        tp.updateTouchPoints(result.touchPoints || []);

        if (result.debugData) {
          setDebugData(result.debugData);
        }

        // Recording
        if (result.matrix) {
          rec.recordFrame(result.matrix, result.touchPoints, result.message);
        }

        setLastUpdateTime(Date.now());

        // Calculate FPS
        const now = Date.now();
        framesRef.current++;
        if (now - lastFpsTimeRef.current >= 1000) {
          setFps(framesRef.current);
          framesRef.current = 0;
          lastFpsTimeRef.current = now;
        }
      });
    } else {
      dataSource.setOnData(null);
    }
  }, [dataSource.mode, dataSource.useSSE]);

  // Interval Effect for Data Loop (skip for URL mode with SSE)
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Skip interval for URL mode when SSE is enabled
    if (dataSource.mode === 'url' && dataSource.useSSE) {
      return;
    }

    if (dataSource.isPlaying) {
      framesRef.current = 0;
      lastFpsTimeRef.current = Date.now();

      let interval = UPDATE_INTERVAL_MS;
      if (dataSource.mode === 'url') interval = 50; // Fallback polling
      if (dataSource.mode === 'playback') interval = 32;

      intervalId = setInterval(handleUpdate, interval);
    } else {
      setFps(0);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [dataSource.isPlaying, handleUpdate, dataSource.mode, dataSource.useSSE]);

  // Effect to render current frame immediately when scrubbing while paused
  useEffect(() => {
    if (dataSource.mode === 'playback' && !dataSource.isPlaying && dataSource.playbackData.length > 0) {
      handleUpdate();
    }
  }, [dataSource.playbackIndex, dataSource.mode, dataSource.isPlaying]);

  // Handlers
  const handleReset = useCallback(() => {
    const result = dataSource.handleReset(touchPointCount);
    touchPoints.resetTrails();

    if (result.touchPoints.length > 0) {
      touchPoints.updateTouchPoints(result.touchPoints);
    }

    setDebugData({
      message: 'System Reset - Waiting...',
      matrix: result.matrix,
      touchPoints: result.touchPoints
    });

    setLastUpdateTime(Date.now());
    recording.clearRecording();
  }, [dataSource, touchPointCount, touchPoints, recording]);

  const handleFileUpload = useCallback((file: File) => {
    touchPoints.resetTrails();
    dataSource.handleFileUpload(file);
  }, [dataSource, touchPoints]);

  const handleDownloadCsv = useCallback(() => {
    recording.downloadCsv({
      matrix: dataSource.data,
      touchPoints: touchPoints.activeTouchPoints,
      message: debugData?.message || 'Snapshot'
    });
  }, [recording, dataSource.data, touchPoints.activeTouchPoints, debugData]);

  const handleDownloadJson = useCallback(() => {
    recording.downloadJson({
      matrix: dataSource.data,
      touchPoints: touchPoints.activeTouchPoints,
      message: debugData?.message || 'Snapshot'
    });
  }, [recording, dataSource.data, touchPoints.activeTouchPoints, debugData]);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 sm:p-8 bg-gray-50 dark:bg-gray-950 font-sans transition-colors duration-300">
      <header className="w-full max-w-7xl mb-6 space-y-4">
        {/* Top Row: Title & Stats */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
              Live Matrix Visualizer
              {recording.isRecording && (
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              )}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 transition-colors">
                {dataSource.data.length}x{dataSource.data[0]?.length || 0} Grid
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 transition-colors">
                {dataSource.mode === 'simulation' ? UPDATE_INTERVAL_MS : (dataSource.mode === 'playback' ? '~32' : '500')}ms interval
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 transition-colors">
                {fps} FPS
              </span>
              {recording.hasRecording && !recording.isRecording && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 transition-colors">
                  {recording.recordedFrameCount} Frames Saved
                </span>
              )}
            </div>
          </div>

          <Toolbar
            isPlaying={dataSource.isPlaying}
            setIsPlaying={dataSource.setIsPlaying}
            onReset={handleReset}
            isRecording={recording.isRecording}
            onStartRecording={recording.startRecording}
            onStopRecording={recording.stopRecording}
            onDownloadCsv={handleDownloadCsv}
            onDownloadJson={handleDownloadJson}
            mode={dataSource.mode}
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
          />
        </div>

        {/* Row 2: Matrix Source Selection */}
        <ModeSelector
          mode={dataSource.mode}
          setMode={dataSource.setMode}
          url={dataSource.url}
          setUrl={dataSource.setUrl}
          fetchError={dataSource.fetchError}
          playbackData={dataSource.playbackData}
          playbackIndex={dataSource.playbackIndex}
          setPlaybackIndex={dataSource.setPlaybackIndex}
          onFileUpload={handleFileUpload}
        />

        {/* Row 3: Touch Controls */}
        <ControlPanel
          mode={dataSource.mode}
          touchPointSize={touchPointSize}
          setTouchPointSize={setTouchPointSize}
          touchPointCount={touchPointCount}
          setTouchPointCount={setTouchPointCount}
          showMatrix={showMatrix}
          setShowMatrix={setShowMatrix}
          showTouchPoints={showTouchPoints}
          setShowTouchPoints={setShowTouchPoints}
          showTrails={showTrails}
          setShowTrails={setShowTrails}
          trailStyle={trailStyle}
          setTrailStyle={setTrailStyle}
        />
      </header>

      {/* Main Content Area: Split View */}
      <main className="w-full max-w-7xl bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden h-[650px] transition-colors">
        {/* Status Bar */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50 shrink-0 transition-colors">
          <div className="flex items-center gap-4 overflow-x-auto">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span>
              <span>Low (0)</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="w-24 h-2 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-orange-500"></span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
              <span className="w-3 h-3 rounded-full bg-orange-500"></span>
              <span>High (100)</span>
            </div>
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 font-mono hidden sm:block">
            LAST UPDATE: {new Date(lastUpdateTime).toLocaleTimeString()}
          </div>
        </div>

        {/* Content Split: Canvas (Left) + Tree View (Right) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas Container */}
          <div className="flex-1 overflow-auto bg-gray-900 dark:bg-gray-950 relative scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900 flex justify-center transition-colors">
            <div className="w-full h-full p-4 flex items-center justify-center">
              <div className="w-full h-full max-w-[800px]">
                <DataCanvas
                  data={dataSource.data}
                  pointSize={touchPointSize}
                  points={touchPoints.activeTouchPoints}
                  trailsHistory={touchPoints.trailsHistory}
                  showTrails={showTrails}
                  trailStyle={trailStyle}
                  showMatrix={showMatrix}
                  showTouchPoints={showTouchPoints}
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          </div>

          {/* Tree View Sidebar */}
          {isSidebarOpen && (
            <div className="w-96 border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex flex-col animate-in slide-in-from-right duration-300 shadow-inner transition-colors">
              <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex justify-between items-center sticky top-0 z-10 transition-colors">
                <span className="font-semibold text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <Brackets size={14} className="text-purple-600 dark:text-purple-400" />
                  Live JSON Data
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                  READ-ONLY
                </span>
              </div>
              <div className="flex-1 overflow-auto p-2 scrollbar-thin dark:scrollbar-track-gray-900 dark:scrollbar-thumb-gray-700">
                {debugData ? (
                  <JsonTreeView data={debugData} name="root" initiallyExpanded={true} />
                ) : (
                  <div className="text-gray-400 dark:text-gray-600 text-xs text-center mt-10 italic">
                    Waiting for data...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-8 text-center text-sm text-gray-400 dark:text-gray-600">
        <p>Values represent generated sensor data metrics. Cells update independently.</p>
      </footer>
    </div>
  );
}
