import React, { useState, useRef, useCallback } from 'react';
import { Frame, Matrix, TouchPoint } from '../types';
import {
  generateCsvContent,
  generateJsonContent,
  downloadFile,
  generateFilename
} from '../utils/exportUtils';

interface UseRecordingReturn {
  isRecording: boolean;
  hasRecording: boolean;
  recordedFrameCount: number;
  startRecording: () => void;
  stopRecording: () => void;
  recordFrame: (matrix: Matrix, touchPoints: TouchPoint[], message: string) => void;
  downloadCsv: (snapshotData?: { matrix: Matrix; touchPoints: TouchPoint[]; message: string }) => void;
  downloadJson: (snapshotData?: { matrix: Matrix; touchPoints: TouchPoint[]; message: string }) => void;
  clearRecording: () => void;
  isRecordingRef: React.MutableRefObject<boolean>;
}

export function useRecording(): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);

  const isRecordingRef = useRef(false);
  const recordedDataRef = useRef<Frame[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingEndTimeRef = useRef<number>(0);

  const startRecording = useCallback(() => {
    recordedDataRef.current = [];
    recordingStartTimeRef.current = Date.now();
    recordingEndTimeRef.current = 0;
    setHasRecording(false);
    isRecordingRef.current = true;
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    recordingEndTimeRef.current = Date.now();
    setIsRecording(false);
    if (recordedDataRef.current.length > 0) {
      setHasRecording(true);
    }
  }, []);

  const recordFrame = useCallback((matrix: Matrix, touchPoints: TouchPoint[], message: string) => {
    if (!isRecordingRef.current) return;

    recordedDataRef.current.push({
      ts: Date.now(),
      message,
      matrix,
      touchPoints: touchPoints.slice(0, 10)
    });
  }, []);

  const downloadCsv = useCallback((snapshotData?: { matrix: Matrix; touchPoints: TouchPoint[]; message: string }) => {
    if (isRecordingRef.current) return;

    const isSnapshot = recordedDataRef.current.length === 0;

    const framesToExport: Frame[] = isSnapshot && snapshotData
      ? [{
          ts: Date.now(),
          message: snapshotData.message || 'Snapshot',
          matrix: snapshotData.matrix,
          touchPoints: snapshotData.touchPoints.slice(0, 10)
        }]
      : recordedDataRef.current;

    if (framesToExport.length === 0) return;

    const csvContent = generateCsvContent(framesToExport);
    const filename = generateFilename(
      'csv',
      isSnapshot,
      recordingStartTimeRef.current,
      recordingEndTimeRef.current
    );

    downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
  }, []);

  const downloadJson = useCallback((snapshotData?: { matrix: Matrix; touchPoints: TouchPoint[]; message: string }) => {
    if (isRecordingRef.current) return;

    const isSnapshot = recordedDataRef.current.length === 0;

    const framesToExport: Frame[] = isSnapshot && snapshotData
      ? [{
          ts: Date.now(),
          message: snapshotData.message || 'Snapshot',
          matrix: snapshotData.matrix,
          touchPoints: snapshotData.touchPoints
        }]
      : recordedDataRef.current;

    if (framesToExport.length === 0) return;

    const jsonContent = generateJsonContent(framesToExport, isSnapshot);
    const filename = generateFilename(
      'json',
      isSnapshot,
      recordingStartTimeRef.current,
      recordingEndTimeRef.current
    );

    downloadFile(jsonContent, filename, 'application/json');
  }, []);

  const clearRecording = useCallback(() => {
    recordedDataRef.current = [];
    setHasRecording(false);
    if (isRecording) {
      stopRecording();
    }
  }, [isRecording, stopRecording]);

  return {
    isRecording,
    hasRecording,
    recordedFrameCount: recordedDataRef.current.length,
    startRecording,
    stopRecording,
    recordFrame,
    downloadCsv,
    downloadJson,
    clearRecording,
    isRecordingRef
  };
}
