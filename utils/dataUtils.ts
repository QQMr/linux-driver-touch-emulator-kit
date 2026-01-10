import { MIN_VALUE, MAX_VALUE } from '../constants';
import { TouchPoint } from '../types';

export const generateRandomMatrix = (rows: number, cols: number): number[][] => {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.floor(Math.random() * (MAX_VALUE - MIN_VALUE + 1)) + MIN_VALUE)
  );
};

export const updateMatrix = (prevMatrix: number[][]): number[][] => {
  // Update random cells to simulate live data changes, keeping some stability
  return prevMatrix.map(row =>
    row.map(cell => {
      // Adjusted for 16ms refresh rate (approx 60fps)
      // Small changes (-2 to +2) create a smoother, more organic transition
      const change = Math.floor(Math.random() * 5) - 2; 
      let newValue = cell + change;
      // Clamp values
      newValue = Math.max(MIN_VALUE, Math.min(MAX_VALUE, newValue));
      return newValue;
    })
  );
};

export const getSimulatedPoints = (timestamp: number, count: number): TouchPoint[] => {
  const speed = 0.0002;
  const activePoints: TouchPoint[] = [];
  // distinct vibrant colors for trails
  const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f43f5e', '#6366f1'];
  
  for (let i = 0; i < count; i++) {
    const yRel = (i + 1) / (count + 1);
    const offset = i * (0.8 / count);
    
    // Wave pattern movement for X axis
    const progress = (timestamp * speed + offset) % 1.2;
    
    // Only return points that are within the visible bounds [0, 1]
    if (progress >= 0 && progress <= 1) {
      activePoints.push({ 
        id: i, 
        x: progress, 
        y: yRel,
        color: colors[i % colors.length]
      });
    }
  }
  return activePoints;
};