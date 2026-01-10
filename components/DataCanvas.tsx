import React, { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import { useResizeObserver } from '../hooks/useResizeObserver';
import { MIN_VALUE, MAX_VALUE, FONT_FAMILY } from '../constants';
import { Matrix, TouchPoint, TrailStyle } from '../types';

interface DataCanvasProps {
  data: Matrix;
  pointSize?: number;
  points?: TouchPoint[];
  trailsHistory?: Record<string | number, { x: number, y: number }[]>;
  showTrails?: boolean;
  trailStyle?: TrailStyle;
  showMatrix?: boolean;
  showTouchPoints?: boolean;
  isDarkMode?: boolean;
}

export const DataCanvas: React.FC<DataCanvasProps> = ({ 
  data, 
  pointSize = 1.0,
  points = [],
  trailsHistory = {},
  showTrails = false,
  trailStyle = 'fade',
  showMatrix = true,
  showTouchPoints = true,
  isDarkMode = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Offscreen canvas for static elements (headers, background)
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const { width, height } = useResizeObserver(containerRef);
  
  // Store props in ref
  const propsRef = useRef({ 
    data, 
    pointSize, 
    points, 
    trailsHistory, 
    showTrails, 
    trailStyle, 
    showMatrix, 
    showTouchPoints, 
    isDarkMode 
  });

  useEffect(() => {
    propsRef.current = { 
        data, 
        pointSize, 
        points, 
        trailsHistory, 
        showTrails, 
        trailStyle, 
        showMatrix, 
        showTouchPoints, 
        isDarkMode 
    };
  }, [data, pointSize, points, trailsHistory, showTrails, trailStyle, showMatrix, showTouchPoints, isDarkMode]);

  // Setup color scale using D3
  const colorScale = useMemo(() => {
    return d3.scaleSequential()
      .domain([MIN_VALUE, MAX_VALUE])
      .interpolator(d3.interpolateTurbo); 
  }, []);

  // Theme configuration helper
  const getTheme = (dark: boolean) => (dark ? {
    bg: '#111827', // gray-900
    headerBg: '#0f172a', // slate-900
    headerCorner: '#1e293b', // slate-800
    text: '#94a3b8', // slate-400
    pointBorder: '#ffffff',
    gridGap: '#111827' // gray-900
  } : {
    bg: '#ffffff',
    headerBg: '#f8fafc', // slate-50
    headerCorner: '#e2e8f0', // slate-200
    text: '#64748b', // slate-500
    pointBorder: '#1e293b', // slate-800
    gridGap: '#ffffff'
  });

  // Effect: Render Static Elements to Offscreen Canvas
  useEffect(() => {
    if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement('canvas');
    }
    const offCtx = offscreenCanvasRef.current.getContext('2d');
    if (!offCtx || width === 0 || height === 0) return;

    // Dimensions
    const dpr = window.devicePixelRatio || 1;
    offscreenCanvasRef.current.width = width * dpr;
    offscreenCanvasRef.current.height = height * dpr;
    offCtx.scale(dpr, dpr);

    const { data: currentData, showMatrix, isDarkMode } = propsRef.current;
    const theme = getTheme(isDarkMode);

    const rows = currentData.length;
    const cols = currentData[0]?.length || 0;

    // Clear background
    offCtx.fillStyle = theme.bg;
    offCtx.fillRect(0, 0, width, height);

    if (showMatrix && rows > 0 && cols > 0) {
        const headerSize = 24;
        const gridWidth = width - headerSize;
        const gridHeight = height - headerSize;
        const cellWidth = gridWidth / cols;
        const cellHeight = gridHeight / rows;

        // Header strips
        offCtx.fillStyle = theme.headerBg;
        offCtx.fillRect(0, 0, headerSize, height); // Left
        offCtx.fillRect(0, 0, width, headerSize); // Top
        offCtx.fillStyle = theme.headerCorner;
        offCtx.fillRect(0, 0, headerSize, headerSize); // Corner

        // Text settings for indices
        offCtx.textAlign = 'center';
        offCtx.textBaseline = 'middle';
        offCtx.font = `400 10px ${FONT_FAMILY}`;
        offCtx.fillStyle = theme.text;

        // Col Indices
        for (let c = 0; c < cols; c++) {
          const cx = headerSize + c * cellWidth + cellWidth / 2;
          const cy = headerSize / 2;
          offCtx.fillText(c.toString(), Math.floor(cx), Math.floor(cy));
        }

        // Row Indices
        for (let r = 0; r < rows; r++) {
          const rx = headerSize / 2;
          const ry = headerSize + r * cellHeight + cellHeight / 2;
          offCtx.fillText(r.toString(), Math.floor(rx), Math.floor(ry));
        }
    }
  }, [width, height, isDarkMode, propsRef.current.showMatrix, propsRef.current.data.length, propsRef.current.data[0]?.length]);


  // Effect: Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const rectWidth = width;
      const rectHeight = height;
      
      if (rectWidth === 0 || rectHeight === 0) return;

      // Handle High DPI
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rectWidth * dpr || canvas.height !== rectHeight * dpr) {
        canvas.width = rectWidth * dpr;
        canvas.height = rectHeight * dpr;
        ctx.scale(dpr, dpr); 
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // --- LAYER 1: Static Elements (From Offscreen) ---
      if (offscreenCanvasRef.current) {
        // We draw the cached background image. This saves hundreds of text rendering calls per frame.
        ctx.drawImage(offscreenCanvasRef.current, 0, 0, rectWidth, rectHeight);
      } else {
        // Fallback clear
        ctx.clearRect(0,0, rectWidth, rectHeight);
      }

      // Read current props
      const { 
        data: currentData, 
        pointSize, 
        points, 
        trailsHistory, 
        showTrails, 
        trailStyle, 
        showMatrix, 
        showTouchPoints, 
        isDarkMode 
      } = propsRef.current;
      
      const theme = getTheme(isDarkMode);
      const rows = currentData.length;
      const cols = currentData[0]?.length || 0;

      if (rows === 0 || cols === 0) return;

      const headerSize = 24;
      const gridWidth = rectWidth - headerSize;
      const gridHeight = rectHeight - headerSize;
      const cellWidth = gridWidth / cols;
      const cellHeight = gridHeight / rows;

      // --- LAYER 2: Data Grid (Dynamic) ---
      
      if (showMatrix) {
          const fontSize = Math.min(cellWidth, cellHeight) * 0.4;
          ctx.font = `500 ${fontSize}px ${FONT_FAMILY}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Optimization: Pre-calculate reusable values
          const gap = 1;
          const w = Math.ceil(cellWidth - gap * 2);
          const h = Math.ceil(cellHeight - gap * 2);
          const halfW = cellWidth / 2;
          const halfH = cellHeight / 2;

          for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
            const y = headerSize + rowIndex * cellHeight;
            const rowData = currentData[rowIndex];
            
            for (let colIndex = 0; colIndex < cols; colIndex++) {
              const x = headerSize + colIndex * cellWidth;
              const value = rowData[colIndex];

              ctx.fillStyle = colorScale(value);
              // Use integers for x/y to prevent antialiasing blur on edges
              ctx.fillRect(Math.floor(x + gap), Math.floor(y + gap), w, h);

              // Text on top
              ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
              ctx.fillText(Math.round(value).toString(), Math.floor(x + halfW), Math.floor(y + halfH));
            }
          }
      }

      // --- LAYER 3: Touch Points & Trails ---
      
      if (showTouchPoints && points && points.length > 0) {
        const pointsToDraw = points.slice(0, 10);

        // Draw Trails
        if (showTrails && trailsHistory) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          pointsToDraw.forEach(p => {
            const path = trailsHistory[p.id];
            
            if (path && path.length > 1) {
              const color = p.color || (isDarkMode ? '#ffffff' : '#000000');
              
              // Enable Glow for trails
              ctx.shadowBlur = 8;
              ctx.shadowColor = color;
              
              if (trailStyle === 'fade') {
                  const len = path.length;
                  for (let i = 0; i < len - 1; i++) {
                      const pt1 = path[i];
                      const pt2 = path[i+1];
                      const x1 = headerSize + pt1.x * gridWidth;
                      const y1 = headerSize + pt1.y * gridHeight;
                      const x2 = headerSize + pt2.x * gridWidth;
                      const y2 = headerSize + pt2.y * gridHeight;
                      
                      const progress = i / (len - 1);
                      
                      ctx.beginPath();
                      ctx.moveTo(x1, y1);
                      ctx.lineTo(x2, y2);
                      
                      ctx.globalAlpha = Math.max(0.1, progress); 
                      ctx.lineWidth = Math.max(1, (2 * pointSize) * (0.4 + 0.6 * progress)); 
                      
                      ctx.strokeStyle = color;
                      ctx.stroke();
                  }
                  ctx.globalAlpha = 1.0; 
              } else {
                  ctx.beginPath();
                  const startX = headerSize + path[0].x * gridWidth;
                  const startY = headerSize + path[0].y * gridHeight;
                  ctx.moveTo(startX, startY);

                  for (let i = 1; i < path.length; i++) {
                    const px = headerSize + path[i].x * gridWidth;
                    const py = headerSize + path[i].y * gridHeight;
                    ctx.lineTo(px, py);
                  }

                  ctx.lineWidth = 2 * pointSize;
                  
                  if (trailStyle === 'dashed') {
                      ctx.setLineDash([10 * pointSize, 10 * pointSize]);
                  } else if (trailStyle === 'dotted') {
                      ctx.setLineDash([2 * pointSize, 6 * pointSize]);
                  } else {
                      ctx.setLineDash([]);
                  }

                  ctx.strokeStyle = color;
                  ctx.stroke();
                  ctx.setLineDash([]);
              }
              
              // Reset Shadow after trails
              ctx.shadowBlur = 0;
            }
          });
        }

        // Draw Points
        pointsToDraw.forEach(p => {
           const tx = headerSize + p.x * gridWidth;
           const ty = headerSize + p.y * gridHeight;
           const baseRadius = Math.min(cellWidth, cellHeight); 
           const radius = baseRadius * pointSize;
           const color = p.color || 'rgba(255, 255, 255, 0.4)';

           // Point Glow
           ctx.shadowBlur = 15;
           ctx.shadowColor = color;

           // Glow Gradient
           const gradient = ctx.createRadialGradient(tx, ty, radius * 0.2, tx, ty, radius);
           gradient.addColorStop(0, color);
           gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

           ctx.beginPath();
           ctx.arc(tx, ty, radius, 0, Math.PI * 2);
           ctx.fillStyle = gradient;
           ctx.fill();

           // Border ring
           ctx.shadowBlur = 0; // Reset for sharp line
           ctx.beginPath();
           ctx.arc(tx, ty, radius, 0, Math.PI * 2);
           ctx.strokeStyle = theme.pointBorder;
           ctx.lineWidth = 2;
           ctx.stroke();

           // Center dot
           ctx.beginPath();
           ctx.arc(tx, ty, 3, 0, Math.PI * 2);
           ctx.fillStyle = theme.pointBorder;
           ctx.fill();
        });
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [width, height, colorScale]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};