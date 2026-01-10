import React, { useState, useRef, useCallback } from 'react';
import { DataSourceMode, Matrix, TouchPoint, Frame } from '../types';
import { generateRandomMatrix, updateMatrix, getSimulatedPoints } from '../utils/dataUtils';
import { GRID_ROWS, GRID_COLS, UPDATE_INTERVAL_MS } from '../constants';

interface UpdateResult {
  matrix: Matrix | null;
  touchPoints: TouchPoint[];
  message: string;
  debugData: any;
}

interface UseDataSourceReturn {
  mode: DataSourceMode;
  setMode: (mode: DataSourceMode) => void;
  data: Matrix;
  url: string;
  setUrl: (url: string) => void;
  fetchError: string | null;
  playbackData: Frame[];
  playbackIndex: number;
  setPlaybackIndex: (index: number) => void;
  handleUpdate: () => Promise<UpdateResult>;
  handleReset: (touchPointCount: number) => { matrix: Matrix; touchPoints: TouchPoint[] };
  handleFileUpload: (file: File) => Promise<void>;
  dataRef: React.MutableRefObject<Matrix>;
  simulationTimeRef: React.MutableRefObject<number>;
  isPlayingRef: React.MutableRefObject<boolean>;
  setIsPlaying: (playing: boolean) => void;
  isPlaying: boolean;
}

export function useDataSource(): UseDataSourceReturn {
  const [mode, setMode] = useState<DataSourceMode>('simulation');
  const [data, setData] = useState<Matrix>(() => generateRandomMatrix(GRID_ROWS, GRID_COLS));
  const [url, setUrl] = useState('http://localhost:3000/data');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [playbackData, setPlaybackData] = useState<Frame[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const dataRef = useRef<Matrix>(data);
  const simulationTimeRef = useRef<number>(Date.now());
  const playbackIndexRef = useRef(0);
  const isFetchingRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  const touchPointCountRef = useRef(3);

  // Sync refs
  const updateIsPlaying = useCallback((playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  }, []);

  const handleUpdate = useCallback(async (): Promise<UpdateResult> => {
    let newData: Matrix | null = null;
    let nextTouchPoints: TouchPoint[] = [];
    let currentDebugData: any = null;
    let currentMessage = '';
    const now = Date.now();

    const dt = mode === 'simulation' ? UPDATE_INTERVAL_MS : 500;
    simulationTimeRef.current += dt;

    if (mode === 'simulation') {
      newData = updateMatrix(dataRef.current);
      dataRef.current = newData;
      setData(newData);

      nextTouchPoints = getSimulatedPoints(simulationTimeRef.current, touchPointCountRef.current);

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
        if (isPlayingRef.current) {
          playbackIndexRef.current = playbackIndexRef.current + 1;
          if (playbackIndexRef.current >= playbackData.length) {
            playbackIndexRef.current = 0;
          }
          setPlaybackIndex(playbackIndexRef.current);
        }

        const frame = playbackData[playbackIndexRef.current];
        if (frame) {
          newData = frame.matrix;
          nextTouchPoints = frame.touchPoints || [];
          currentMessage = frame.message || `Frame ${playbackIndexRef.current + 1}/${playbackData.length}`;

          if (newData) {
            dataRef.current = newData;
            setData(newData);
          }
          currentDebugData = frame;
        }
      }
    } else {
      // URL Mode
      if (isFetchingRef.current) {
        return { matrix: null, touchPoints: [], message: '', debugData: null };
      }

      try {
        isFetchingRef.current = true;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();

        if (json.matrix && Array.isArray(json.matrix)) {
          newData = json.matrix;
          nextTouchPoints = json.touchPoints && Array.isArray(json.touchPoints)
            ? json.touchPoints
            : [];
        } else if (Array.isArray(json) && Array.isArray(json[0])) {
          newData = json;
          nextTouchPoints = [];
        } else {
          throw new Error('Invalid format. Expected 2D array or { matrix, touchPoints } object.');
        }

        currentMessage = json.message && typeof json.message === 'string'
          ? json.message
          : `Fetched from ${url} at ${new Date().toLocaleTimeString()}`;

        if (newData) {
          dataRef.current = newData;
          setData(newData);
          setFetchError(null);
        }

        currentDebugData = json;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setFetchError(errorMsg);
        currentMessage = `Error: ${errorMsg}`;
      } finally {
        isFetchingRef.current = false;
      }
    }

    return {
      matrix: newData,
      touchPoints: nextTouchPoints,
      message: currentMessage,
      debugData: currentDebugData
    };
  }, [mode, url, playbackData]);

  const handleReset = useCallback((touchPointCount: number): { matrix: Matrix; touchPoints: TouchPoint[] } => {
    touchPointCountRef.current = touchPointCount;

    if (mode === 'simulation') {
      const newData = generateRandomMatrix(GRID_ROWS, GRID_COLS);
      setData(newData);
      dataRef.current = newData;
      simulationTimeRef.current = Date.now();
      const resetPoints = getSimulatedPoints(simulationTimeRef.current, touchPointCount);
      return { matrix: newData, touchPoints: resetPoints };
    } else if (mode === 'playback') {
      setPlaybackIndex(0);
      playbackIndexRef.current = 0;
      return { matrix: data, touchPoints: [] };
    } else {
      return { matrix: data, touchPoints: [] };
    }
  }, [mode, data]);

  const handleFileUpload = useCallback(async (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          let frames: Frame[] = [];

          if (json.frames && Array.isArray(json.frames)) {
            frames = json.frames;
          } else if (Array.isArray(json)) {
            frames = json;
          } else {
            throw new Error("Invalid JSON format. Expected array or object with 'frames' array.");
          }

          if (frames.length === 0) {
            throw new Error('No frames found in JSON.');
          }

          setPlaybackData(frames);
          setMode('playback');
          setPlaybackIndex(0);
          playbackIndexRef.current = 0;
          updateIsPlaying(true);
          setFetchError(null);
          resolve();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to parse JSON';
          setFetchError(errorMsg);
          reject(new Error(errorMsg));
        }
      };
      reader.readAsText(file);
    });
  }, [updateIsPlaying]);

  // Update touchPointCount ref when needed
  const updateTouchPointCount = (count: number) => {
    touchPointCountRef.current = count;
  };

  return {
    mode,
    setMode,
    data,
    url,
    setUrl,
    fetchError,
    playbackData,
    playbackIndex,
    setPlaybackIndex: (index: number) => {
      setPlaybackIndex(index);
      playbackIndexRef.current = index;
    },
    handleUpdate,
    handleReset,
    handleFileUpload,
    dataRef,
    simulationTimeRef,
    isPlayingRef,
    setIsPlaying: updateIsPlaying,
    isPlaying
  };
}
