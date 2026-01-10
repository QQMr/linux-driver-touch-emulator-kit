import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DataCanvas } from './components/DataCanvas';
import { JsonTreeView } from './components/JsonTreeView';
import { generateRandomMatrix, updateMatrix, getSimulatedPoints } from './utils/dataUtils';
import { GRID_ROWS, GRID_COLS, UPDATE_INTERVAL_MS } from './constants';
import { Play, Pause, RefreshCw, Circle, Square, Download, FileJson, Cpu, Globe, AlertCircle, SlidersHorizontal, Hash, PanelRightClose, PanelRightOpen, Brackets, Activity, Upload, Film, SkipBack, SkipForward, Grid3x3, MousePointer2, Sun, Moon } from 'lucide-react';
import { TouchPoint, TrailStyle } from './types';

type DataSourceMode = 'simulation' | 'url' | 'playback';

const TRAIL_STYLES: TrailStyle[] = ['solid', 'dashed', 'dotted', 'fade'];

export default function App() {
  // Data State
  const [data, setData] = useState<number[][]>(() => generateRandomMatrix(GRID_ROWS, GRID_COLS));
  // Ref to hold the current data for synchronous access in the update loop
  const dataRef = useRef<number[][]>(data);

  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [fps, setFps] = useState(0);

  // Control State
  const [isPlaying, setIsPlaying] = useState(true);
  const [mode, setMode] = useState<DataSourceMode>('simulation');
  const [url, setUrl] = useState('http://localhost:3000/data');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Playback State
  const [playbackData, setPlaybackData] = useState<any[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const playbackIndexRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Visual / Touch State
  const [touchPointSize, setTouchPointSize] = useState(1.0);
  const [touchPointCount, setTouchPointCount] = useState(3);
  const [showTrails, setShowTrails] = useState(false);
  const [trailStyle, setTrailStyle] = useState<TrailStyle>('fade');
  const [showMatrix, setShowMatrix] = useState(true);
  const [showTouchPoints, setShowTouchPoints] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // State for points to be rendered (simulated or external)
  const [activeTouchPoints, setActiveTouchPoints] = useState<TouchPoint[]>(() => getSimulatedPoints(Date.now(), 3));
  
  // History of trails: Map ID -> Array of positions
  const [trailsHistory, setTrailsHistory] = useState<Record<string | number, { x: number, y: number }[]>>({});
  const trailsHistoryRef = useRef<Record<string | number, { x: number, y: number }[]>>({});
  
  // Simulation Time Tracking (to allow pausing)
  const simulationTimeRef = useRef<number>(Date.now());

  // Debug Data for Tree View
  const [debugData, setDebugData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);

  // Refs
  const framesRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const isRecordingRef = useRef(false);
  
  // Update recordedDataRef type to include touch points and message
  const recordedDataRef = useRef<{ ts: number; message: string; matrix: number[][]; touchPoints: TouchPoint[] }[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingEndTimeRef = useRef<number>(0);
  
  const isFetchingRef = useRef(false);

  // Refs for items used inside the update interval to avoid stale closures or re-creation
  const touchPointCountRef = useRef(touchPointCount);
  
  // We keep a ref of the current active points for recording purposes
  const activeTouchPointsRef = useRef(activeTouchPoints);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => { touchPointCountRef.current = touchPointCount; }, [touchPointCount]);
  useEffect(() => { activeTouchPointsRef.current = activeTouchPoints; }, [activeTouchPoints]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Handle Dark Mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Handle File Upload for Playback
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        let frames: any[] = [];

        // Support wrapper format or raw array
        if (json.frames && Array.isArray(json.frames)) {
          frames = json.frames;
        } else if (Array.isArray(json)) {
          frames = json;
        } else {
          throw new Error("Invalid JSON format. Expected array or object with 'frames' array.");
        }

        if (frames.length === 0) {
          throw new Error("No frames found in JSON.");
        }

        setPlaybackData(frames);
        setMode('playback');
        setPlaybackIndex(0);
        playbackIndexRef.current = 0;
        setIsPlaying(true);
        setFetchError(null);
        
        // Reset trails when loading new file
        trailsHistoryRef.current = {};
        setTrailsHistory({});

      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Failed to parse JSON");
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again if needed
    event.target.value = '';
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value);
    setPlaybackIndex(idx);
    playbackIndexRef.current = idx;
    // If scrubbing, user might want to see that specific frame immediately
    // The interval loop will pick this up on next tick, or we could force an update here.
  };

  // Update Logic for Matrix Data and Touch Data
  const handleUpdate = useCallback(async () => {
    let newData: number[][] | null = null;
    let nextTouchPoints: TouchPoint[] = [];
    let currentDebugData: any = null;
    let currentMessage = "";
    const now = Date.now();

    // Advance simulation time only when update runs
    const dt = mode === 'simulation' ? UPDATE_INTERVAL_MS : 500;
    simulationTimeRef.current += dt;

    if (mode === 'simulation') {
      // Calculate new data synchronously using the ref
      newData = updateMatrix(dataRef.current);
      // Update the ref immediately
      dataRef.current = newData;
      // Schedule the state update for rendering
      setData(newData);

      // Calculate simulated touch points based on controlled time
      nextTouchPoints = getSimulatedPoints(simulationTimeRef.current, touchPointCountRef.current);

      // Generate a dynamic message for simulation
      const load = (Math.sin(now / 2000) * 30 + 40).toFixed(1);
      const phases = ['SCANNING', 'PROCESSING', 'TRANSMITTING', 'IDLE'];
      const phase = phases[Math.floor((now / 1000) % phases.length)];
      
      currentMessage = `System: ONLINE | Phase: ${phase} | Load: ${load}% | Tick: ${simulationTimeRef.current}`;
      
      currentDebugData = {
        message: currentMessage,
        matrix: newData,
        touchPoints: nextTouchPoints
      };

    } else if (mode === 'playback') {
       if (playbackData.length > 0) {
          // If playing, advance index
          if (isPlayingRef.current) {
             playbackIndexRef.current = (playbackIndexRef.current + 1);
             // Loop or stop at end? Let's loop for now
             if (playbackIndexRef.current >= playbackData.length) {
                playbackIndexRef.current = 0;
                // Clear trails on loop
                trailsHistoryRef.current = {};
                setTrailsHistory({});
             }
             setPlaybackIndex(playbackIndexRef.current);
          }
          
          const frame = playbackData[playbackIndexRef.current];
          if (frame) {
             newData = frame.matrix;
             nextTouchPoints = frame.touchPoints || [];
             currentMessage = frame.message || `Frame ${playbackIndexRef.current + 1}/${playbackData.length}`;
             
             // In playback, we might want trails to behave differently (e.g. clear on jump), 
             // but for simplicity we treat it like a continuous stream unless manually reset.
             
             if (newData) {
                dataRef.current = newData;
                setData(newData);
             }
             currentDebugData = frame;
          }
       }
    } else {
      // URL Mode
      if (isFetchingRef.current) return;
      
      try {
        isFetchingRef.current = true;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        
        // Handle Composite Response { matrix: [...], touchPoints: [...] }
        if (json.matrix && Array.isArray(json.matrix)) {
           newData = json.matrix;
           if (json.touchPoints && Array.isArray(json.touchPoints)) {
              nextTouchPoints = json.touchPoints;
           } else {
              nextTouchPoints = [];
           }
        } 
        // Handle Standard 2D Array Response
        else if (Array.isArray(json) && Array.isArray(json[0])) {
           newData = json;
           nextTouchPoints = [];
        } else {
           throw new Error('Invalid format. Expected 2D array or { matrix, touchPoints } object.');
        }

        // Try to find a message in the response
        if (json.message && typeof json.message === 'string') {
          currentMessage = json.message;
        } else {
          currentMessage = `Fetched from ${url} at ${new Date().toLocaleTimeString()}`;
        }

        if (newData) {
           dataRef.current = newData; // Keep ref in sync
           setData(newData);
           setFetchError(null);
        }

        currentDebugData = json;

      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Unknown error');
        currentMessage = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      } finally {
        isFetchingRef.current = false;
      }
    }

    // Update Touch Points and History
    // We update history even if no newData for matrix to ensure smooth touch movement if decoupled (though here they are coupled)
    if (nextTouchPoints) {
        setActiveTouchPoints(nextTouchPoints);
        activeTouchPointsRef.current = nextTouchPoints;

        // Update trails history
        const nextHistory = { ...trailsHistoryRef.current };
        const activeIds = new Set(nextTouchPoints.map(p => p.id));
        
        nextTouchPoints.forEach(p => {
            const id = p.id;
            if (!nextHistory[id]) {
                nextHistory[id] = [];
            }
            // Add new point
            nextHistory[id] = [...nextHistory[id], { x: p.x, y: p.y }];
            
            // Limit history length to prevent infinite memory growth (e.g., 500 frames ~ 8 seconds at 60fps)
            if (nextHistory[id].length > 500) {
                nextHistory[id].shift();
            }
        });

        // Optional: Clean up history for IDs that are no longer active
        Object.keys(nextHistory).forEach(key => {
            // Check if key is in activeIds (handle number/string mismatch)
            const keyNum = Number(key);
            const isPresent = activeIds.has(key) || (!isNaN(keyNum) && activeIds.has(keyNum));
            
            if (!isPresent) {
                delete nextHistory[key];
            }
        });

        trailsHistoryRef.current = nextHistory;
        setTrailsHistory(nextHistory);
    }

    // Set debug data for tree view
    if (currentDebugData) {
      setDebugData(currentDebugData);
    }

    // Post-update logic (Recording & FPS)
    // We record if there was new data generated/fetched
    // Don't record during playback mode to avoid recursion
    if (newData && mode !== 'playback') {
      if (isRecordingRef.current) {
        // Use the points we just calculated/fetched
        // Limit to 10 points max for CSV structure consistency
        const pointsToRecord = nextTouchPoints.slice(0, 10);

        recordedDataRef.current.push({
          ts: now,
          message: currentMessage,
          matrix: newData,
          touchPoints: pointsToRecord
        });
      }
    }

    setLastUpdateTime(now);

    // Calculate FPS
    framesRef.current++;
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(framesRef.current);
      framesRef.current = 0;
      lastFpsTimeRef.current = now;
    }
  }, [mode, url, playbackData]); // playbackData in dep array to update if file changes

  // Interval Effect for Data Loop
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (isPlaying || mode === 'playback') { 
      // Note: We keep the interval running in playback mode even if isPlaying is false, 
      // but the update logic inside handles the "pause" state for playback index.
      // Actually, if paused in playback mode, we might not need to render continuously, 
      // but re-rendering handles trails/canvas updates if window resizes etc.
      
      framesRef.current = 0;
      lastFpsTimeRef.current = Date.now();
      
      // Use different intervals
      let interval = UPDATE_INTERVAL_MS;
      if (mode === 'url') interval = 500;
      if (mode === 'playback') interval = 32; // ~30fps for playback reading
      
      // For playback, only run interval if playing, OR if we need to render one frame (handled by effect dep)
      // Simpler: Run interval always if we are "live". If playback paused, we can stop interval or just not increment index.
      // Let's run it if (isPlaying) to allow global pause button to work.
      if (isPlaying) {
         intervalId = setInterval(handleUpdate, interval);
      }
    } else {
      setFps(0);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying, handleUpdate, mode]);

  // Effect to render current frame immediately when scrubbing while paused
  useEffect(() => {
     if (mode === 'playback' && !isPlaying && playbackData.length > 0) {
         handleUpdate();
     }
  }, [playbackIndex, mode, isPlaying]);

  const handleReset = () => {
    if (mode === 'simulation') {
      const newData = generateRandomMatrix(GRID_ROWS, GRID_COLS);
      setData(newData);
      dataRef.current = newData; // Sync ref
      simulationTimeRef.current = Date.now(); // Reset sim time
      const resetPoints = getSimulatedPoints(simulationTimeRef.current, touchPointCount);
      
      // Reset Trails
      trailsHistoryRef.current = {};
      setTrailsHistory({});
      
      setActiveTouchPoints(resetPoints);
      setDebugData({ 
        message: "System Reset - Waiting...",
        matrix: newData, 
        touchPoints: resetPoints 
      });
    } else if (mode === 'playback') {
        setPlaybackIndex(0);
        playbackIndexRef.current = 0;
        trailsHistoryRef.current = {};
        setTrailsHistory({});
    } else {
      setActiveTouchPoints([]);
      trailsHistoryRef.current = {};
      setTrailsHistory({});
      setDebugData(null);
    }
    
    setLastUpdateTime(Date.now());
    if (isRecording) {
      handleStopRecording();
    }
    setFetchError(null);
  };

  const handleStartRecording = () => {
    recordedDataRef.current = [];
    recordingStartTimeRef.current = Date.now();
    recordingEndTimeRef.current = 0;
    setHasRecording(false);
    isRecordingRef.current = true;
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    isRecordingRef.current = false;
    recordingEndTimeRef.current = Date.now();
    setIsRecording(false);
    if (recordedDataRef.current.length > 0) {
      setHasRecording(true);
    }
  };

  const handleDownloadCsv = () => {
    if (isRecording) return;
    
    const isSnapshot = recordedDataRef.current.length === 0;
    
    // Determine frames to export: either the recording or a single snapshot frame
    let framesToExport = isSnapshot 
      ? [{
          ts: Date.now(),
          message: debugData?.message || "Snapshot",
          matrix: data,
          touchPoints: activeTouchPoints.slice(0, 10)
        }]
      : recordedDataRef.current;
      
    if (framesToExport.length === 0) return;

    // Use dimensions from the first frame
    const firstFrame = framesToExport[0].matrix;
    const rows = firstFrame.length;
    const cols = firstFrame[0].length;
    const maxTouchPoints = 10;

    // Build Header
    const headers = ['Timestamp', 'Message'];
    // Matrix Headers
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        headers.push(`R${r}C${c}`);
      }
    }
    // Touch Point Headers (TP1_X, TP1_Y, etc.)
    for (let i = 1; i <= maxTouchPoints; i++) {
        headers.push(`TP${i}_X`, `TP${i}_Y`);
    }
    
    let csvContent = headers.join(',') + '\n';

    framesToExport.forEach(frame => {
      const row: (number | string)[] = [frame.ts, `"${frame.message || ''}"`];
      
      // Matrix Data
      frame.matrix.forEach(matrixRow => {
        matrixRow.forEach(val => {
          row.push(val);
        });
      });

      // Touch Point Data
      for (let i = 0; i < maxTouchPoints; i++) {
          const pt = frame.touchPoints[i];
          if (pt) {
              // Ensure reasonable precision for CSV
              row.push(pt.x.toFixed(4));
              row.push(pt.y.toFixed(4));
          } else {
              row.push('', ''); // Empty cells if fewer points than max
          }
      }

      csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Construct filename
    let filename = '';
    if (isSnapshot) {
      filename = `matrix_snapshot_${Date.now()}.csv`;
    } else {
      const start = recordingStartTimeRef.current;
      const end = recordingEndTimeRef.current || Date.now();
      filename = `matrix_recording_${start}_to_${end}.csv`;
    }
    
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadJson = () => {
    if (isRecording) return;
    
    const isSnapshot = recordedDataRef.current.length === 0;
    
    // Get the raw frames
    const framesToExport = isSnapshot 
      ? [{
          ts: Date.now(),
          message: debugData?.message || "Snapshot",
          matrix: data,
          touchPoints: activeTouchPoints
        }]
      : recordedDataRef.current;
      
    if (framesToExport.length === 0) return;

    // Create a structured export object with a message
    const exportData = {
      fileType: "LiveMatrixRecording",
      exportMessage: isSnapshot ? "Snapshot data saved successfully" : "Recording data saved successfully",
      timestamp: new Date().toISOString(),
      recordCount: framesToExport.length,
      frames: framesToExport
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    let filename = '';
    if (isSnapshot) {
      filename = `matrix_snapshot_${Date.now()}.json`;
    } else {
      const start = recordingStartTimeRef.current;
      const end = recordingEndTimeRef.current || Date.now();
      filename = `matrix_recording_${start}_to_${end}.json`;
    }
    
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 sm:p-8 bg-gray-50 dark:bg-gray-950 font-sans transition-colors duration-300">
      <header className="w-full max-w-7xl mb-6 space-y-4">
        {/* Top Row: Title & Stats */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
              Live Matrix Visualizer
              {isRecording && (
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              )}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 transition-colors">
                {data.length}x{data[0]?.length || 0} Grid
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 transition-colors">
                {mode === 'simulation' ? UPDATE_INTERVAL_MS : (mode === 'playback' ? '~32' : '500')}ms interval
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 transition-colors">
                {fps} FPS
              </span>
              {hasRecording && !isRecording && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 transition-colors">
                  {recordedDataRef.current.length} Frames Saved
                </span>
              )}
            </div>
          </div>
          
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
                onClick={handleReset}
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
                  onClick={handleStartRecording}
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
                  onClick={handleStopRecording}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                >
                  <Square size={16} className="fill-current" />
                  Stop
                </button>
              )}
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
              <button
                onClick={handleDownloadCsv}
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
                onClick={handleDownloadJson}
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
                    className={`p-1.5 rounded-md transition-colors ${isSidebarOpen ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    title="Toggle JSON Inspector"
                >
                    {isSidebarOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
                </button>
                <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
                <button
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
                    title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                </button>
            </div>
          </div>
        </div>

        {/* Row 2: Matrix Source Selection */}
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
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 whitespace-nowrap transition-colors">
                        <Upload size={14} />
                        {playbackData.length > 0 ? "Change File" : "Upload JSON"}
                    </button>
                    <input 
                        ref={fileInputRef}
                        type="file" 
                        accept=".json"
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                </div>

                {playbackData.length > 0 && (
                    <div className="flex-1 w-full flex items-center gap-3 bg-gray-50 dark:bg-gray-800 px-3 py-1 rounded-md border border-gray-200 dark:border-gray-700 transition-colors">
                         <div className="text-xs font-mono text-gray-500 dark:text-gray-400 w-24 whitespace-nowrap">
                            Frame {playbackIndex + 1}/{playbackData.length}
                         </div>
                         <div className="flex-1 flex items-center gap-2">
                             <SkipBack size={14} className="text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300" onClick={() => { setPlaybackIndex(0); playbackIndexRef.current = 0; }} />
                             <input 
                                type="range" 
                                min="0" 
                                max={playbackData.length - 1} 
                                value={playbackIndex} 
                                onChange={handleScrubberChange}
                                className="w-full h-1.5 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                             />
                             <SkipForward size={14} className="text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300" onClick={() => { setPlaybackIndex(playbackData.length -1); playbackIndexRef.current = playbackData.length - 1; }} />
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

        {/* Row 3: Touch Controls */}
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
                 <span className="text-xs font-mono w-8 text-gray-600 dark:text-gray-300">{touchPointSize.toFixed(1)}x</span>
              </div>
            </div>

            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 hidden md:block"></div>

            {/* Visual Toggles Group */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-md transition-colors">
                <button
                    onClick={() => setShowMatrix(!showMatrix)}
                    className={`p-1.5 rounded-md transition-colors ${
                        showMatrix ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                    }`}
                    title="Toggle Matrix Heatmap"
                >
                    <Grid3x3 size={16} />
                </button>
                <button
                    onClick={() => setShowTouchPoints(!showTouchPoints)}
                    className={`p-1.5 rounded-md transition-colors ${
                        showTouchPoints ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                    }`}
                    title="Toggle Touch Points"
                >
                    <MousePointer2 size={16} />
                </button>
                <button
                    onClick={() => setShowTrails(!showTrails)}
                    disabled={!showTouchPoints}
                    className={`p-1.5 rounded-md transition-colors ${
                        showTrails ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                    } ${!showTouchPoints ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Toggle Movement Trails"
                >
                    <Activity size={16} />
                </button>
            </div>

             {/* Trail Style Slider - Visible when trails are enabled */}
             {showTrails && (
              <>
                <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 hidden md:block"></div>
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
                     <span className="text-xs font-mono w-12 text-gray-600 dark:text-gray-300 uppercase text-center">{trailStyle}</span>
                  </div>
                </div>
              </>
            )}

            {/* Point Count Slider (Simulation Mode Only) */}
            {mode === 'simulation' && (
              <>
                <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 hidden md:block"></div>
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
                     <span className="text-xs font-mono w-4 text-gray-600 dark:text-gray-300">{touchPointCount}</span>
                  </div>
                </div>
              </>
            )}
        </div>
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
            {/* Inner Container: Centered */}
             <div className="w-full h-full p-4 flex items-center justify-center">
                <div className="w-full h-full max-w-[800px]">
                  <DataCanvas 
                    data={data} 
                    pointSize={touchPointSize}
                    points={activeTouchPoints}
                    trailsHistory={trailsHistory}
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
                     <div className="text-gray-400 dark:text-gray-600 text-xs text-center mt-10 italic">Waiting for data...</div>
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