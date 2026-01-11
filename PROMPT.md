# Live Matrix Canvas - AI Coding Prompt

Use this prompt when working with AI coding assistants (Cursor, Copilot, Windsurf, etc.)

---

## Project Description

You are working on **Live Matrix Canvas**, a real-time 2D data visualization app built with React 19, TypeScript, and Vite. The app displays a dynamic matrix heatmap with touch point tracking and trail visualization.

## Tech Stack

- **React 19** with functional components and hooks
- **TypeScript** for type safety
- **Vite** for dev server and bundling
- **Tailwind CSS** (via CDN) for styling
- **D3.js** for color scales (turbo interpolation)
- **Lucide React** for icons
- **HTML5 Canvas** for high-performance rendering

## Core Features

1. **Matrix Heatmap** - Renders a 22x36 grid of values (0-100) as colored cells
2. **Touch Points** - Animated circles that move across the canvas
3. **Trail Visualization** - Movement history with fade/solid/dashed/dotted styles
4. **Three Data Modes**:
   - Simulation: Procedurally generated data (16ms updates)
   - URL Fetch: Poll external API (500ms interval)
   - Playback: Load and scrub through recorded JSON files
5. **Recording** - Capture frames and export as CSV or JSON
6. **Dark/Light Theme** - Full dark mode support

## UI Layout

The interface has a **vertical stacked layout** with a split main content area:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                  │
│ ┌─────────────────────────────────┐  ┌────────────────────────────────┐ │
│ │ Title + Status Badges           │  │ Toolbar (right-aligned)        │ │
│ │ "Live Matrix Visualizer"        │  │ [▶ Pause] [⟳] [● Rec] [CSV]   │ │
│ │ [22x36 Grid] [16ms] [60 FPS]    │  │ [JSON] [◧ Sidebar] [☀ Theme]  │ │
│ └─────────────────────────────────┘  └────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│ MODE SELECTOR                                                           │
│ ┌──────────────────────────┐  ┌────────────────────────────────────────┐│
│ │[Simulation][URL][Playback]│  │ URL input or File upload + Scrubber   ││
│ └──────────────────────────┘  └────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────┤
│ CONTROL PANEL                                                           │
│ [Size ═══○═══ 1.0x] [☷ Matrix][◎ Points][〰 Trails] [Style ══○ fade]   │
│                                              [Count ═══○═══ 3] (sim only)│
├─────────────────────────────────────────────────────────────────────────┤
│ MAIN CONTENT (flex row, h-[650px])                                      │
│ ┌───────────────────────────────────────┬───────────────────────────────┤
│ │ STATUS BAR                            │                               │
│ │ [● Low(0)] [gradient] [● High(100)]   │   JSON TREE VIEW              │
│ ├───────────────────────────────────────┤   (w-96, collapsible)         │
│ │                                       │                               │
│ │         DATA CANVAS                   │   [Expand] [Collapse]         │
│ │    (HTML5 Canvas, centered)           │   ▼ root                      │
│ │                                       │     ├─ message: "..."         │
│ │    ┌─────────────────────────┐        │     ├─ matrix: Array(22)      │
│ │    │  0  1  2  3  4  5 ...   │        │     │   ├─ 0: [45, 67, ...]   │
│ │    │ ┌──┬──┬──┬──┬──┬──┐     │        │     │   └─ 1: [23, 89, ...]   │
│ │  0 │ │▓▓│▒▒│░░│▓▓│▒▒│░░│     │        │     └─ touchPoints: Array(3)  │
│ │  1 │ │░░│▓▓│▒▒│░░│▓▓│▒▒│     │        │         ├─ 0: {id, x, y}     │
│ │  2 │ │▒▒│░░│▓▓│  ◉←touch     │        │         └─ 1: {id, x, y}     │
│ │    │ └──┴──┴──┴──┴──┴──┘     │        │                               │
│ │    │     heatmap grid        │        │   Click key → copy path       │
│ │    └─────────────────────────┘        │   Click value → copy value    │
│ │                                       │                               │
│ └───────────────────────────────────────┴───────────────────────────────┤
├─────────────────────────────────────────────────────────────────────────┤
│ FOOTER                                                                  │
│ "Values represent generated sensor data metrics..."                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## UI Components Detail

### Header Row
- **Title**: "Live Matrix Visualizer" with optional recording indicator (pulsing red dot)
- **Status Badges**: Grid dimensions, update interval, FPS counter, recorded frames count
- **Toolbar**: Grouped button clusters with dividers

### Toolbar Buttons (components/Toolbar.tsx)
| Button | Icon | Action | States |
|--------|------|--------|--------|
| Play/Pause | `Play`/`Pause` | Toggle animation | Green (play) / Amber (pause) |
| Reset | `RefreshCw` | Reset to initial state | Gray |
| Record | `Circle`/`Square` | Start/stop recording | Red (rec) / Gray (stop) |
| CSV | `Download` | Export CSV file | Indigo, disabled while recording |
| JSON | `FileJson` | Export JSON file | Teal, disabled while recording |
| Sidebar | `PanelRightClose`/`Open` | Toggle JSON tree | Active state highlight |
| Theme | `Sun`/`Moon` | Toggle dark mode | Gray |

### Mode Selector (components/ModeSelector.tsx)
- **Tab Group**: Pill-style buttons with active state (white bg, shadow)
- **Simulation**: Default mode, no extra UI
- **URL Mode**: Text input for endpoint URL + error display
- **Playback Mode**:
  - Upload button (file input hidden)
  - Frame scrubber (range slider)
  - Skip to start/end buttons
  - Frame counter "Frame 1/500"

### Control Panel (components/ControlPanel.tsx)
| Control | Type | Range | Purpose |
|---------|------|-------|---------|
| Size | Range slider | 0.5x - 3.0x | Touch point radius |
| Matrix toggle | Icon button | on/off | Show/hide heatmap |
| Points toggle | Icon button | on/off | Show/hide touch points |
| Trails toggle | Icon button | on/off | Show/hide movement trails |
| Trail Style | Range slider | 0-3 | solid/dashed/dotted/fade |
| Count | Range slider | 1-10 | Number of touch points (simulation only) |

### Data Canvas (components/DataCanvas.tsx)
- **Container**: Dark background (gray-900), centered content, max-w-[800px]
- **Canvas Elements**:
  - Row/column headers (24px) with index numbers
  - Heatmap cells with D3 turbo color scale (blue → purple → orange)
  - Cell values as white text (hidden when cells too small)
  - Touch points: Radial gradient circles with glow effect
  - Trails: Line paths with configurable style
- **Status Bar**: Color legend with gradient preview

### JSON Tree View (components/JsonTreeView.tsx)
- **Toolbar**: Expand All / Collapse All buttons, "Copied!" notification
- **Tree Structure**:
  - Collapsible nodes with chevron icons
  - Purple keys, colored values (blue=number, green=string, orange=boolean)
  - Array preview for numeric arrays: `[45, 67, 23, ...]`
  - Item count badges
- **Interactions**:
  - Click chevron → expand/collapse
  - Click key → copy path to clipboard
  - Click value → copy value to clipboard
  - Hover → reveal copy button

## Color Palette

### Light Mode
| Element | Color | Tailwind Class |
|---------|-------|----------------|
| Background | White | `bg-white` |
| Page bg | Gray 50 | `bg-gray-50` |
| Text | Gray 900 | `text-gray-900` |
| Muted text | Gray 500 | `text-gray-500` |
| Borders | Gray 200 | `border-gray-200` |
| Canvas bg | Gray 900 | `bg-gray-900` |

### Dark Mode
| Element | Color | Tailwind Class |
|---------|-------|----------------|
| Background | Gray 900 | `dark:bg-gray-900` |
| Page bg | Gray 950 | `dark:bg-gray-950` |
| Text | White | `dark:text-white` |
| Muted text | Gray 400 | `dark:text-gray-400` |
| Borders | Gray 800 | `dark:border-gray-800` |
| Canvas bg | Gray 950 | `dark:bg-gray-950` |

### Accent Colors
| Purpose | Light | Dark |
|---------|-------|------|
| Primary action | Blue 600 | Blue 400 |
| Recording | Red 500 | Red 400 |
| Success | Green 600 | Green 400 |
| Warning | Amber 600 | Amber 400 |
| Keys (JSON) | Purple 700 | Purple 400 |

## Responsive Behavior

- **Header**: Stacks vertically on small screens (`flex-col xl:flex-row`)
- **Control Panel**: Wraps controls on narrow screens (`flex-wrap`)
- **Sidebar**: Fixed 384px width (`w-96`), toggleable
- **Canvas**: Fluid width with max constraint, centered
- **Buttons**: Touch-friendly sizing (min 44px tap targets)

## Architecture

The app follows a **hooks + components** architecture:

```
App.tsx (orchestrator, ~320 lines)
├── Hooks (state & logic)
│   ├── useDataSource - Mode switching, data fetching, playback
│   ├── useRecording - Record frames, export CSV/JSON
│   └── useTouchPoints - Touch tracking, trail history
├── Components (UI)
│   ├── Toolbar - Play/pause, record, export, theme
│   ├── ModeSelector - Simulation/URL/Playback tabs
│   ├── ControlPanel - Visual settings sliders
│   ├── DataCanvas - HTML5 Canvas renderer
│   └── JsonTreeView - Debug JSON inspector
└── Utils
    ├── dataUtils - Matrix generation, simulation
    └── exportUtils - CSV/JSON file generation
```

## Key Patterns

1. **Refs for Stable Callbacks** - Use `useRef` to store hook values, making callbacks stable for `setInterval`:
```tsx
const dataSourceRef = useRef(dataSource);
useEffect(() => { dataSourceRef.current = dataSource; }, [dataSource]);
const handleUpdate = useCallback(() => {
  const ds = dataSourceRef.current;
  // use ds instead of dataSource
}, []); // empty deps = stable
```

2. **Canvas Layers** - Three rendering layers for performance:
   - Layer 1: Static elements (headers) cached in offscreen canvas
   - Layer 2: Dynamic heatmap cells
   - Layer 3: Touch points and trails

3. **Context for Tree State** - JsonTreeView uses React Context for expand/collapse all

4. **Prop Drilling Avoided** - Custom hooks return objects with state + methods

## File Structure

```
/
├── App.tsx                 # Main orchestration
├── index.tsx              # React entry point
├── types.ts               # TypeScript interfaces
├── constants.ts           # Grid size, intervals
├── components/
│   ├── DataCanvas.tsx     # Canvas renderer (D3 + Canvas API)
│   ├── JsonTreeView.tsx   # Collapsible JSON tree
│   ├── Toolbar.tsx        # Top action buttons
│   ├── ModeSelector.tsx   # Mode tabs + URL/file input
│   └── ControlPanel.tsx   # Visual settings
├── hooks/
│   ├── useDataSource.ts   # Data fetching logic
│   ├── useRecording.ts    # Recording + export
│   ├── useTouchPoints.ts  # Touch + trails
│   └── useResizeObserver.ts
├── utils/
│   ├── dataUtils.ts       # Matrix simulation
│   └── exportUtils.ts     # File generation
└── vite.config.ts         # Vite setup
```

## Key Types

```typescript
type DataSourceMode = 'simulation' | 'url' | 'playback';
type TrailStyle = 'solid' | 'dashed' | 'dotted' | 'fade';

interface TouchPoint {
  id: string | number;
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  color?: string;
}

interface Frame {
  ts: number;
  message: string;
  matrix: number[][];
  touchPoints: TouchPoint[];
}
```

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server (localhost:3000)
npm run build        # Production build
npm run preview      # Preview production build
```

## Coding Guidelines

1. **Keep hooks pure** - Hooks return state + methods, no JSX
2. **Components are presentational** - Receive props, render UI
3. **Use refs for intervals/animations** - Avoid stale closure bugs
4. **Canvas optimization** - Use offscreen canvas for static elements
5. **Dark mode** - All components support `dark:` Tailwind classes
6. **Type everything** - No `any` except for debug data

## Common Tasks

**Add a new visual setting:**
1. Add state to `App.tsx`
2. Pass to `ControlPanel.tsx` as prop
3. Pass to `DataCanvas.tsx` for rendering

**Add a new data source mode:**
1. Update `DataSourceMode` in `types.ts`
2. Add case in `useDataSource.handleUpdate()`
3. Add tab button in `ModeSelector.tsx`

**Modify canvas rendering:**
1. Edit `DataCanvas.tsx`
2. Static elements → offscreen canvas effect
3. Dynamic elements → main render loop

---

*Copy this entire prompt when starting a conversation with an AI coding assistant about this project.*
