# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server on localhost:3000
npm run build        # Production build with Vite
npm run preview      # Preview production build
```

## Architecture Overview

This is a **React 19 + Vite + TypeScript** real-time data visualization application that displays dynamic 2D matrix data as a heatmap with live touch point tracking and trail visualization.

### Core Components

- **App.tsx** - Monolithic main component handling state management, data sources, recording/playback, and UI controls
- **DataCanvas.tsx** - High-performance HTML5 Canvas renderer using D3 color scales (turbo interpolation), with offscreen canvas optimization for static elements
- **JsonTreeView.tsx** - Recursive collapsible JSON tree inspector for live debug data

### Data Flow

The app operates in three modes (`DataSourceMode`):
1. **Simulation** - Procedurally generated matrix data + simulated touch points (16ms interval)
2. **URL Fetch** - External API polling (500ms interval) expecting `number[][]` or `{ matrix, touchPoints, message }`
3. **Playback** - JSON file upload with frame-by-frame scrubber (32ms interval)

Data updates flow through `setInterval` → state updates → `requestAnimationFrame` in DataCanvas.

### Key Technical Patterns

- **Ref-based state access** - Uses `useRef` to avoid stale closures in animation/interval loops
- **Canvas layers** - Three layers: static headers (offscreen cached), dynamic matrix heatmap, touch points with trails
- **No router** - Mode switching is client-side state only
- **Tailwind via CDN** - Styles loaded from CDN in index.html with dark mode class support

### Environment

- `GEMINI_API_KEY` in `.env.local` is a template placeholder (no actual Gemini API calls in codebase)
- Path alias: `@/*` maps to project root
