export type Matrix = number[][];

export interface CanvasSize {
  width: number;
  height: number;
}

export interface TouchPoint {
  id: string | number;
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
  color?: string;
}

export type TrailStyle = 'solid' | 'dashed' | 'dotted' | 'fade';