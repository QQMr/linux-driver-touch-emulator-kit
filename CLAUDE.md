# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server on localhost:3001
npm run build        # Production build with Vite
npm run preview      # Preview production build
```

### C Matrix Server (optional data source)

```bash
cd server
make                 # Compile (requires gcc)
./matrix_server      # Runs HTTP server on port 3000 with /data and /stream endpoints
```

## Architecture Overview

**React 19 + Vite + TypeScript** real-time data visualization app displaying 2D matrix data as a heatmap with touch point tracking and trails.

### Project Structure

- **Root level** - Main app files (App.tsx, index.tsx, types.ts, constants.ts)
- **components/** - UI components (DataCanvas, Toolbar, ControlPanel, ModeSelector, JsonTreeView)
- **hooks/** - Custom hooks (useDataSource, useRecording, useTouchPoints, useResizeObserver)
- **utils/** - Data generation and export utilities
- **server/** - C-based HTTP server for testing URL mode

### Data Flow

Three modes (`DataSourceMode` in types.ts):

1. **Simulation** - Local procedural generation via `setInterval` (16ms)
2. **URL Fetch** - SSE stream (default) or HTTP polling fallback from external endpoint
3. **Playback** - JSON file upload with frame scrubber (32ms)

SSE flow: `EventSource` → `useDataSource` callback → state update → canvas render
Polling flow: `setInterval` → `handleUpdate()` → fetch → state update → canvas render

### Key Technical Patterns

- **Ref-based state access** - `useRef` avoids stale closures in intervals/animation loops
- **SSE for real-time data** - URL mode uses Server-Sent Events by default (`/stream` endpoint), falls back to polling `/data`
- **Canvas layers** - Static headers (offscreen cached), dynamic matrix heatmap, touch points with trails
- **Tailwind via CDN** - Styles loaded from CDN in index.html with dark mode class support

### Data Format (URL mode)

Server must return JSON in one of these formats:
```json
{ "matrix": [[0-100, ...], ...], "touchPoints": [{"id": 1, "x": 0.5, "y": 0.5, "color": "#FF0000"}], "message": "..." }
// or just a 2D array:
[[0-100, ...], ...]
```

### Environment

- Dev server runs on port **3001** (Vite), C server on port **3000**
- `GEMINI_API_KEY` in `.env.local` is a template placeholder (unused)
- Path alias: `@/*` maps to project root
