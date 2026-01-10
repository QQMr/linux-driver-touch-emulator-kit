import React, { useState, useRef, useCallback } from 'react';
import { TouchPoint, TrailsHistory } from '../types';
import { getSimulatedPoints } from '../utils/dataUtils';

const MAX_TRAIL_LENGTH = 500;

interface UseTouchPointsReturn {
  activeTouchPoints: TouchPoint[];
  trailsHistory: TrailsHistory;
  updateTouchPoints: (points: TouchPoint[]) => void;
  resetTrails: () => void;
  getSimulatedPointsForTime: (time: number, count: number) => TouchPoint[];
  activeTouchPointsRef: React.MutableRefObject<TouchPoint[]>;
}

export function useTouchPoints(initialCount: number = 3): UseTouchPointsReturn {
  const [activeTouchPoints, setActiveTouchPoints] = useState<TouchPoint[]>(() =>
    getSimulatedPoints(Date.now(), initialCount)
  );
  const [trailsHistory, setTrailsHistory] = useState<TrailsHistory>({});

  const trailsHistoryRef = useRef<TrailsHistory>({});
  const activeTouchPointsRef = useRef<TouchPoint[]>(activeTouchPoints);

  const updateTouchPoints = useCallback((nextTouchPoints: TouchPoint[]) => {
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
      nextHistory[id] = [...nextHistory[id], { x: p.x, y: p.y }];

      // Limit history length
      if (nextHistory[id].length > MAX_TRAIL_LENGTH) {
        nextHistory[id].shift();
      }
    });

    // Clean up history for IDs that are no longer active
    Object.keys(nextHistory).forEach(key => {
      const keyNum = Number(key);
      const isPresent = activeIds.has(key) || (!isNaN(keyNum) && activeIds.has(keyNum));

      if (!isPresent) {
        delete nextHistory[key];
      }
    });

    trailsHistoryRef.current = nextHistory;
    setTrailsHistory(nextHistory);
  }, []);

  const resetTrails = useCallback(() => {
    trailsHistoryRef.current = {};
    setTrailsHistory({});
  }, []);

  const getSimulatedPointsForTime = useCallback((time: number, count: number): TouchPoint[] => {
    return getSimulatedPoints(time, count);
  }, []);

  return {
    activeTouchPoints,
    trailsHistory,
    updateTouchPoints,
    resetTrails,
    getSimulatedPointsForTime,
    activeTouchPointsRef
  };
}
