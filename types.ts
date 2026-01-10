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

export type DataSourceMode = 'simulation' | 'url' | 'playback';

export interface Frame {
  ts: number;
  message: string;
  matrix: Matrix;
  touchPoints: TouchPoint[];
}

export interface TrailsHistory {
  [id: string | number]: { x: number; y: number }[];
}

export interface VisualSettings {
  touchPointSize: number;
  touchPointCount: number;
  showTrails: boolean;
  trailStyle: TrailStyle;
  showMatrix: boolean;
  showTouchPoints: boolean;
  isDarkMode: boolean;
}
