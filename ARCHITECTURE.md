# Architecture Flowchart

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                              App.tsx                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │useDataSource│  │useRecording │  │useTouchPoints│                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ Toolbar  │  │ ModeSelector │  │ ControlPanel │                  │
│  └──────────┘  └──────────────┘  └──────────────┘                  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                        Main Content                          │   │
│  │  ┌─────────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │     DataCanvas      │  │      JsonTreeView           │   │   │
│  │  │  (HTML5 Canvas)     │  │   (Debug Sidebar)           │   │   │
│  │  └─────────────────────┘  └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES                                 │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│   Simulation    │    URL Fetch    │           Playback              │
│   (16ms loop)   │   (500ms poll)  │        (32ms frames)            │
└────────┬────────┴────────┬────────┴────────────┬────────────────────┘
         │                 │                      │
         ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      useDataSource Hook                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  handleUpdate() → returns { matrix, touchPoints, message }  │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          App.tsx                                     │
│                     (Orchestration Layer)                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  setInterval(handleUpdate, interval)                         │   │
│  │       │                                                       │   │
│  │       ├──► useTouchPoints.updateTouchPoints(points)          │   │
│  │       ├──► useRecording.recordFrame(matrix, points, msg)     │   │
│  │       └──► setDebugData(debugData)                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
└────────┬───────────────────┬────────────────────┬───────────────────┘
         │                   │                    │
         ▼                   ▼                    ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────────┐
│   DataCanvas    │ │  JsonTreeView   │ │     UI Components           │
│                 │ │                 │ │  Toolbar, ModeSelector,     │
│  matrix ───────►│ │  debugData ────►│ │  ControlPanel               │
│  touchPoints ──►│ │                 │ │                             │
│  trailsHistory►│ │                 │ │                             │
└─────────────────┘ └─────────────────┘ └─────────────────────────────┘
```

## Hook Dependencies

```
┌─────────────────────────────────────────────────────────────────────┐
│                        useDataSource                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ State:                                                       │    │
│  │   mode, data, url, fetchError, playbackData, playbackIndex   │    │
│  │   isPlaying                                                  │    │
│  │                                                              │    │
│  │ Methods:                                                     │    │
│  │   handleUpdate() ──► Updates matrix based on mode            │    │
│  │   handleReset()  ──► Resets to initial state                 │    │
│  │   handleFileUpload() ──► Loads JSON for playback             │    │
│  │                                                              │    │
│  │ Dependencies:                                                │    │
│  │   └── utils/dataUtils.ts (generateRandomMatrix, updateMatrix)│    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        useTouchPoints                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ State:                                                       │    │
│  │   activeTouchPoints, trailsHistory                           │    │
│  │                                                              │    │
│  │ Methods:                                                     │    │
│  │   updateTouchPoints(points) ──► Updates points + trails     │    │
│  │   resetTrails() ──► Clears trail history                    │    │
│  │                                                              │    │
│  │ Logic:                                                       │    │
│  │   - Maintains trail history (max 500 points per ID)         │    │
│  │   - Cleans up inactive point IDs                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         useRecording                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ State:                                                       │    │
│  │   isRecording, hasRecording, recordedFrameCount              │    │
│  │                                                              │    │
│  │ Methods:                                                     │    │
│  │   startRecording() ──► Begin capturing frames                │    │
│  │   stopRecording()  ──► End capture                           │    │
│  │   recordFrame(matrix, points, msg) ──► Store frame           │    │
│  │   downloadCsv()  ──► Export as CSV                           │    │
│  │   downloadJson() ──► Export as JSON                          │    │
│  │                                                              │    │
│  │ Dependencies:                                                │    │
│  │   └── utils/exportUtils.ts (generateCsvContent, etc.)        │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## Canvas Rendering Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DataCanvas.tsx                                │
└─────────────────────────────────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────────┐
│  LAYER 1        │   │  LAYER 2        │   │  LAYER 3                │
│  Static Elements│   │  Dynamic Grid   │   │  Touch Points & Trails  │
│  (Offscreen)    │   │  (Main Canvas)  │   │  (Main Canvas)          │
├─────────────────┤   ├─────────────────┤   ├─────────────────────────┤
│ • Background    │   │ • Heatmap cells │   │ • Trail paths           │
│ • Row/Col       │   │ • Cell values   │   │ • Glow effects          │
│   headers       │   │ • Color scale   │   │ • Point circles         │
│ • Corner        │   │   (D3 turbo)    │   │ • Border rings          │
└────────┬────────┘   └────────┬────────┘   └────────────┬────────────┘
         │                     │                         │
         └─────────────────────┼─────────────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │  requestAnimationFrame
                    │     render loop     │
                    └─────────────────────┘
```

## User Interaction Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER ACTIONS                                 │
└─────────────────────────────────────────────────────────────────────┘
         │
         ├──► Play/Pause ──► dataSource.setIsPlaying()
         │                         │
         │                         ▼
         │                   setInterval starts/stops
         │
         ├──► Mode Switch ──► dataSource.setMode()
         │    (Sim/URL/Play)       │
         │                         ▼
         │                   handleUpdate() uses new mode logic
         │
         ├──► Upload JSON ──► dataSource.handleFileUpload()
         │                         │
         │                         ▼
         │                   setMode('playback') + load frames
         │
         ├──► Record ──► recording.startRecording()
         │                   │
         │                   ▼
         │              Each handleUpdate() calls recordFrame()
         │                   │
         │                   ▼
         │              recording.stopRecording()
         │
         ├──► Download ──► recording.downloadCsv() / downloadJson()
         │                   │
         │                   ▼
         │              exportUtils generates file + triggers download
         │
         ├──► Visual Toggles ──► setState (showMatrix, showTrails, etc.)
         │                            │
         │                            ▼
         │                       DataCanvas re-renders
         │
         └──► Reset ──► dataSource.handleReset()
                             │
                             ▼
                        touchPoints.resetTrails()
                        recording.clearRecording()
```

## File Structure

```
live-matrix-canvas/
│
├── App.tsx                 # Main orchestration (307 lines)
│
├── components/
│   ├── DataCanvas.tsx      # HTML5 Canvas renderer
│   ├── JsonTreeView.tsx    # Debug JSON tree
│   ├── Toolbar.tsx         # Play/Record/Export/Theme
│   ├── ModeSelector.tsx    # Sim/URL/Playback tabs
│   └── ControlPanel.tsx    # Visual settings sliders
│
├── hooks/
│   ├── useDataSource.ts    # Data fetching & mode logic
│   ├── useRecording.ts     # Recording & export
│   ├── useTouchPoints.ts   # Touch tracking & trails
│   └── useResizeObserver.ts# Canvas resize handling
│
├── utils/
│   ├── dataUtils.ts        # Matrix generation & simulation
│   └── exportUtils.ts      # CSV/JSON file generation
│
├── types.ts                # TypeScript interfaces
├── constants.ts            # Grid size, intervals, fonts
└── index.tsx               # React entry point
```
