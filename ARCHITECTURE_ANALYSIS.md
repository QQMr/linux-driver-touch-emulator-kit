# Architecture Analysis: React ↔ C Server ↔ Linux Driver

This document describes the complete data flow from Linux kernel driver through the C server to the React frontend.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌───────────────┐     SSE/HTTP      ┌───────────────┐      read()         │
│  │    REACT      │ ←───────────────→ │   C SERVER    │ ←────────────────→  │
│  │  (Port 3001)  │   JSON frames     │  (Port 3000)  │   866 bytes binary  │
│  └───────────────┘                   └───────────────┘                      │
│         ↓                                    ↓                              │
│   Canvas Render                     /dev/sitronix_virtual                   │
│                                              ↓                              │
│                                    ┌───────────────────┐                    │
│                                    │   LINUX KERNEL    │                    │
│                                    │  DEVICE DRIVER    │                    │
│                                    └───────────────────┘                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: React Frontend → C Server Data Flow

### 1.1 Connection Modes

React supports two methods to receive data from the C server:

| Method | Endpoint | Connection Type | Frequency | Use Case |
|--------|----------|-----------------|-----------|----------|
| **SSE (Default)** | `/stream` | Persistent | Server-driven (60 FPS) | Real-time |
| **Polling (Fallback)** | `/data` | Request/Response | Client-driven (50ms) | Legacy/Fallback |

### 1.2 SSE Flow (Primary - Recommended)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REACT FRONTEND                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User selects "URL Fetch" mode                                          │
│     └─→ ModeSelector.tsx sets mode = 'url'                                 │
│                                                                             │
│  2. useDataSource hook initializes                                          │
│     ┌─────────────────────────────────────────────────────────────────┐    │
│     │ // hooks/useDataSource.ts                                       │    │
│     │                                                                  │    │
│     │ const eventSource = new EventSource(url.replace('/data', '/stream'));│
│     │ eventSource.onmessage = (event) => {                            │    │
│     │   const json = JSON.parse(event.data);                          │    │
│     │   onDataCallbackRef.current?.(json);  // Trigger callback       │    │
│     │ };                                                               │    │
│     └─────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  3. SSE message arrives from server                                         │
│     Server sends: "data: {\"matrix\":[[...]], ...}\n\n"                    │
│                                                                             │
│  4. App.tsx processes the data                                              │
│     ┌─────────────────────────────────────────────────────────────────┐    │
│     │ // App.tsx useEffect for SSE                                    │    │
│     │                                                                  │    │
│     │ dataSource.setOnData((result: UpdateResult) => {                │    │
│     │   // Update touch points with trail history                     │    │
│     │   touchPoints.updateTouchPoints(result.touchPoints);            │    │
│     │                                                                  │    │
│     │   // Record frame for playback/export                           │    │
│     │   recording.recordFrame(result.matrix, ...);                    │    │
│     │                                                                  │    │
│     │   // Update debug display                                        │    │
│     │   setDebugData(result);                                         │    │
│     │ });                                                              │    │
│     └─────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  5. Canvas renders the frame                                                │
│     └─→ DataCanvas.tsx draws heatmap + touch points + trails               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 HTTP Polling Flow (Fallback)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REACT FRONTEND                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. SSE connection fails or is disabled                                     │
│                                                                             │
│  2. useDataSource falls back to polling                                     │
│     ┌─────────────────────────────────────────────────────────────────┐    │
│     │ // hooks/useDataSource.ts                                       │    │
│     │                                                                  │    │
│     │ const intervalId = setInterval(async () => {                    │    │
│     │   const response = await fetch(url);  // GET /data              │    │
│     │   const json = await response.json();                           │    │
│     │   // Process same as SSE...                                      │    │
│     │ }, 50);  // Poll every 50ms                                     │    │
│     └─────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  3. Each poll:                                                              │
│     ├─→ HTTP GET http://localhost:3000/data                                │
│     ├─→ Server returns JSON frame                                          │
│     └─→ React updates state and re-renders                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.4 JSON Data Format (Server → React)

```json
{
  "matrix": [
    [45, 52, 61, ..., 78],    // Row 0 (36 columns, values 0-100)
    [50, 55, 63, ..., 80],    // Row 1
    // ... 22 rows total
  ],
  "touchPoints": [
    {
      "id": 1,
      "x": 0.5,               // Normalized X (0.0 - 1.0)
      "y": 0.3,               // Normalized Y (0.0 - 1.0)
      "color": "#FF0000"      // Optional color
    }
  ],
  "message": "C Server [SIM]: 60 FPS | Frame: 12345 | Touch: 2 pts"
}
```

### 1.5 Key React Files

| File | Purpose |
|------|---------|
| `hooks/useDataSource.ts` | SSE/Polling connection management |
| `hooks/useTouchPoints.ts` | Touch point tracking with trail history |
| `App.tsx` | Main orchestration, SSE callback handler |
| `components/DataCanvas.tsx` | Canvas rendering (heatmap + touch points) |
| `types.ts` | TypeScript interfaces (Frame, TouchPoint, etc.) |

---

## Part 2: C Server → Linux Device Driver Data Flow

### 2.1 Server Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           C SERVER (matrix_server.c)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                      MAIN THREAD (Accept Loop)                      │    │
│  ├────────────────────────────────────────────────────────────────────┤    │
│  │                                                                     │    │
│  │  while(running) {                                                   │    │
│  │    client_fd = accept(server_fd);                                  │    │
│  │    parse_http_request(client_fd) → route to handler                │    │
│  │                                                                     │    │
│  │    GET /stream → handle_sse_stream(client_fd, shared_state)       │    │
│  │    GET /data   → handle_data_request(client_fd, shared_state)     │    │
│  │  }                                                                  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                  DATA ACQUISITION THREAD (Parallel)                 │    │
│  ├────────────────────────────────────────────────────────────────────┤    │
│  │                                                                     │    │
│  │  while(running) {                                                   │    │
│  │    // Acquire frame from source                                     │    │
│  │    if (mode == SIMULATION)                                         │    │
│  │      generate_simulation_frame(&local_frame);                      │    │
│  │    else if (mode == DRIVER)                                        │    │
│  │      read_driver_frame(driver_fd, &local_frame);  ← FROM KERNEL   │    │
│  │                                                                     │    │
│  │    // Thread-safe update                                            │    │
│  │    pthread_mutex_lock(&shared_state->mutex);                       │    │
│  │    memcpy(&shared_state->current_frame, &local_frame, ...);        │    │
│  │    pthread_cond_broadcast(&shared_state->new_frame_cond);          │    │
│  │    pthread_mutex_unlock(&shared_state->mutex);                     │    │
│  │                                                                     │    │
│  │    sleep_until_next_frame(1000ms / FPS);                           │    │
│  │  }                                                                  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Driver Reading Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    C SERVER: read_driver_frame()                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Open device (once at startup)                                           │
│     ┌─────────────────────────────────────────────────────────────────┐    │
│     │ driver_fd = open("/dev/sitronix_virtual", O_RDONLY);            │    │
│     │ // or /dev/touchmatrix for real hardware                        │    │
│     └─────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  2. Read binary frame (866 bytes)                                           │
│     ┌─────────────────────────────────────────────────────────────────┐    │
│     │ uint8_t buffer[866];                                            │    │
│     │ ssize_t bytes = read(driver_fd, buffer, 866);                   │    │
│     │ // This BLOCKS until driver has new data                        │    │
│     └─────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  3. Parse Sitronix binary format (sitronix.c)                              │
│     ┌─────────────────────────────────────────────────────────────────┐    │
│     │ parse_sitronix_buffer(buffer, &frame);                          │    │
│     │                                                                  │    │
│     │ // Parse header (bytes 0-3)                                      │    │
│     │ frame.adv_touch_info = buffer[0];                               │    │
│     │ frame.gesture_info = buffer[2];                                 │    │
│     │ frame.keys = buffer[3];                                         │    │
│     │                                                                  │    │
│     │ // Parse touch points (bytes 4-73, 10 points × 7 bytes)         │    │
│     │ for (int i = 0; i < 10; i++) {                                  │    │
│     │   uint8_t *tp = &buffer[4 + i*7];                               │    │
│     │   if (tp[0] & 0x80) {  // Valid bit set?                        │    │
│     │     int raw_x = ((tp[0] & 0x3F) << 8) | tp[1];  // 14-bit X     │    │
│     │     int raw_y = ((tp[2] & 0x3F) << 8) | tp[3];  // 14-bit Y     │    │
│     │     frame.touch_points[i].x = raw_x / 16383.0; // Normalize     │    │
│     │     frame.touch_points[i].y = raw_y / 16383.0;                  │    │
│     │     frame.touch_points[i].area = tp[4];                         │    │
│     │     frame.touch_points[i].intensity = tp[5];                    │    │
│     │   }                                                              │    │
│     │ }                                                                │    │
│     │                                                                  │    │
│     │ // Parse matrix data (bytes 74-865, 22×36 = 792 bytes)          │    │
│     │ for (int r = 0; r < 22; r++) {                                  │    │
│     │   for (int c = 0; c < 36; c++) {                                │    │
│     │     uint8_t raw = buffer[74 + r*36 + c];  // 0-255              │    │
│     │     frame.matrix[r][c] = raw * 100 / 255; // Scale to 0-100     │    │
│     │   }                                                              │    │
│     │ }                                                                │    │
│     └─────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  4. Return FrameData structure to main acquisition thread                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Sitronix Binary Format (866 bytes)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SITRONIX FRAME FORMAT (866 bytes)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OFFSET   SIZE   FIELD                  DESCRIPTION                         │
│  ──────────────────────────────────────────────────────────────────────────│
│                                                                             │
│  HEADER (4 bytes)                                                           │
│  ├─ 0x00   1     Advanced Touch Info   [RstChip|ProxStatus|WithCoord|...]  │
│  ├─ 0x01   1     Reserved              Always 0                             │
│  ├─ 0x02   1     Gesture Info          Gesture code (swipe, pinch, etc.)   │
│  └─ 0x03   1     Keys                  [Rsvd|Key5|Key4|Key3|Key2|Key1|Key0]│
│                                                                             │
│  TOUCH DATA (70 bytes = 10 points × 7 bytes each)                          │
│  ├─ 0x04-0x0A   Point 0                                                     │
│  │   ├─ Byte 0: [Valid(1)|Rsvd(1)|X_High(6)]                               │
│  │   ├─ Byte 1: [X_Low(8)]                                                  │
│  │   ├─ Byte 2: [Rsvd(2)|Y_High(6)]                                        │
│  │   ├─ Byte 3: [Y_Low(8)]                                                  │
│  │   ├─ Byte 4: Touch Area (0-255)                                          │
│  │   ├─ Byte 5: Touch Intensity (0-255)                                     │
│  │   └─ Byte 6: Reserved                                                    │
│  ├─ 0x0B-0x11   Point 1                                                     │
│  │   ...                                                                    │
│  └─ 0x46-0x4C   Point 9                                                     │
│                                                                             │
│  MATRIX DATA (792 bytes = 22 rows × 36 columns)                            │
│  └─ 0x4A-0x361  Raw uint8 values (0-255)                                   │
│                 Row-major order: matrix[0][0], matrix[0][1], ..., matrix[21][35]│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Key C Server Files

| File | Purpose |
|------|---------|
| `matrix_server.c` | Main server, threading, HTTP endpoints |
| `matrix_common.h` | Shared data structures (FrameData, TouchPoint) |
| `sitronix.c` | Binary format parser for Sitronix frames |
| `sitronix.h` | Constants (SITRONIX_COORD_MAX = 16383) |

---

## Part 3: Linux Virtual Device Driver

### 3.1 Kernel Module Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LINUX KERNEL MODULE (sitronix_virtual.c)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MODULE INIT (insmod sitronix_virtual.ko)                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ sitronix_init():                                                     │   │
│  │   ├─ alloc_chrdev_region(&dev_num, ...)     // Get major/minor      │   │
│  │   ├─ class_create("sitronix")                // /sys/class/sitronix │   │
│  │   ├─ device_create(dev_num)                  // /dev/sitronix_virtual│   │
│  │   ├─ cdev_init(&cdev, &fops)                 // Register file ops   │   │
│  │   ├─ cdev_add(&cdev)                         // Activate device     │   │
│  │   ├─ mutex_init(&mutex)                      // Thread safety       │   │
│  │   ├─ init_waitqueue_head(&read_queue)        // For blocking reads  │   │
│  │   └─ timer_setup(&timer, callback, 60ms)     // Start data generation│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  TIMER CALLBACK (every 60ms)                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ sitronix_timer_callback():                                           │   │
│  │   ├─ mutex_lock(&dev->mutex)                                        │   │
│  │   │                                                                  │   │
│  │   │  // Generate simulated touch point (bouncing ball)              │   │
│  │   ├─ dev->sim_x += dev->sim_dir_x;                                  │   │
│  │   ├─ dev->sim_y += dev->sim_dir_y;                                  │   │
│  │   ├─ if (boundary_hit) bounce();                                    │   │
│  │   │                                                                  │   │
│  │   │  // Write header (4 bytes)                                      │   │
│  │   ├─ frame_buffer[0] = 0;  // adv_touch_info                        │   │
│  │   ├─ frame_buffer[1] = 0;  // reserved                              │   │
│  │   ├─ frame_buffer[2] = 0;  // gesture_info                          │   │
│  │   ├─ frame_buffer[3] = 0;  // keys                                  │   │
│  │   │                                                                  │   │
│  │   │  // Write touch point (7 bytes at offset 4)                     │   │
│  │   ├─ frame_buffer[4] = 0x80 | (sim_x >> 8);  // Valid + X high      │   │
│  │   ├─ frame_buffer[5] = sim_x & 0xFF;         // X low               │   │
│  │   ├─ frame_buffer[6] = sim_y >> 8;           // Y high              │   │
│  │   ├─ frame_buffer[7] = sim_y & 0xFF;         // Y low               │   │
│  │   ├─ frame_buffer[8] = 60;                   // area                │   │
│  │   ├─ frame_buffer[9] = 100;                  // intensity           │   │
│  │   │                                                                  │   │
│  │   │  // Generate matrix data (792 bytes at offset 74)               │   │
│  │   ├─ for (r = 0; r < 22; r++)                                       │   │
│  │   │   for (c = 0; c < 36; c++)                                      │   │
│  │   │     frame_buffer[74 + r*36 + c] = pattern(r, c, sequence);      │   │
│  │   │                                                                  │   │
│  │   ├─ dev->data_ready = 1;                                           │   │
│  │   ├─ wake_up_interruptible(&dev->read_queue);  // Signal readers    │   │
│  │   ├─ mutex_unlock(&dev->mutex)                                      │   │
│  │   └─ mod_timer(&timer, jiffies + msecs_to_jiffies(60))              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  FILE OPERATIONS                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ sitronix_read(file, buf, count, offset):                            │   │
│  │   ├─ if (count < 866) return -EINVAL;                               │   │
│  │   │                                                                  │   │
│  │   ├─ if (file->f_flags & O_NONBLOCK) {                              │   │
│  │   │     if (!data_ready) return -EAGAIN;                            │   │
│  │   │   }                                                              │   │
│  │   ├─ else {                                                          │   │
│  │   │     wait_event_interruptible(read_queue, data_ready);           │   │
│  │   │   }                                                              │   │
│  │   │                                                                  │   │
│  │   ├─ mutex_lock(&mutex);                                            │   │
│  │   ├─ copy_to_user(buf, frame_buffer, 866);                          │   │
│  │   ├─ data_ready = 0;                                                │   │
│  │   ├─ mutex_unlock(&mutex);                                          │   │
│  │   └─ return 866;                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Driver Build & Install

```bash
cd server/linux_virtual_device_driver

# Build kernel module
make
# Output: sitronix_virtual.ko

# Load module (creates /dev/sitronix_virtual)
sudo insmod sitronix_virtual.ko

# Verify device
ls -la /dev/sitronix_virtual
# crw-rw-rw- 1 root root 234, 0 ... /dev/sitronix_virtual

# Check kernel log
dmesg | tail
# sitronix_virtual: module loaded, device created

# Unload module
sudo rmmod sitronix_virtual
```

---

## Part 4: Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                        COMPLETE SYSTEM DATA FLOW                            │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LAYER 1: LINUX KERNEL (Device Driver)                                      │
│  ═══════════════════════════════════════                                    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────┐              │
│  │ /dev/sitronix_virtual (or /dev/touchmatrix)               │              │
│  │                                                           │              │
│  │  Timer Callback (60ms)                                    │              │
│  │       ↓                                                   │              │
│  │  Generate 866-byte frame                                  │              │
│  │       ↓                                                   │              │
│  │  frame_buffer[] ← [Header][TouchData][MatrixData]        │              │
│  │       ↓                                                   │              │
│  │  data_ready = 1                                           │              │
│  │       ↓                                                   │              │
│  │  wake_up_interruptible(&read_queue)                       │              │
│  └───────────────────────────────────────────────────────────┘              │
│                              ↓                                               │
│                     read(fd, buf, 866)                                      │
│                     [BLOCKS until data_ready]                               │
│                              ↓                                               │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  LAYER 2: USER SPACE (C Server)                                             │
│  ═══════════════════════════════                                            │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────┐              │
│  │ matrix_server (Port 3000)                                 │              │
│  │                                                           │              │
│  │  Data Acquisition Thread:                                 │              │
│  │       ↓                                                   │              │
│  │  read(driver_fd, buffer, 866)  ← From kernel              │              │
│  │       ↓                                                   │              │
│  │  parse_sitronix_buffer(buffer, &frame)                    │              │
│  │       ↓                                                   │              │
│  │  pthread_mutex_lock(&mutex)                               │              │
│  │  shared_state.current_frame = frame                       │              │
│  │  pthread_cond_broadcast(&new_frame_cond)                  │              │
│  │  pthread_mutex_unlock(&mutex)                             │              │
│  │                                                           │              │
│  │  SSE Handler Thread (for each connected client):          │              │
│  │       ↓                                                   │              │
│  │  pthread_cond_wait(&new_frame_cond)  ← Wait for signal   │              │
│  │       ↓                                                   │              │
│  │  frame_to_json(current_frame) → JSON string               │              │
│  │       ↓                                                   │              │
│  │  write(client_fd, "data: {json}\n\n")                     │              │
│  └───────────────────────────────────────────────────────────┘              │
│                              ↓                                               │
│                    SSE Stream (text/event-stream)                           │
│                    HTTP GET /stream                                         │
│                              ↓                                               │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  LAYER 3: BROWSER (React Frontend)                                          │
│  ════════════════════════════════                                           │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────┐              │
│  │ React App (Port 3001)                                     │              │
│  │                                                           │              │
│  │  useDataSource hook:                                      │              │
│  │       ↓                                                   │              │
│  │  eventSource = new EventSource('/stream')                 │              │
│  │       ↓                                                   │              │
│  │  eventSource.onmessage = (event) => {                     │              │
│  │    const data = JSON.parse(event.data);                   │              │
│  │    onDataCallback(data);                                   │              │
│  │  }                                                        │              │
│  │                                                           │              │
│  │  App.tsx:                                                 │              │
│  │       ↓                                                   │              │
│  │  onDataCallback receives: { matrix, touchPoints, message }│              │
│  │       ↓                                                   │              │
│  │  touchPoints.updateTouchPoints(data.touchPoints)          │              │
│  │  recording.recordFrame(data.matrix, ...)                  │              │
│  │       ↓                                                   │              │
│  │  React re-render → DataCanvas.tsx                         │              │
│  │       ↓                                                   │              │
│  │  ┌─────────────────────────────────────────┐              │              │
│  │  │ Canvas 2D Rendering                     │              │              │
│  │  │ ┌─────────────────────────────────────┐ │              │              │
│  │  │ │  HEATMAP (22×36 grid)               │ │              │              │
│  │  │ │  Blue (0) → Purple (50) → Orange (100)│              │              │
│  │  │ │                                       │ │              │              │
│  │  │ │  TOUCH POINTS (circles)             │ │              │              │
│  │  │ │  + Trail lines (movement history)   │ │              │              │
│  │  │ └─────────────────────────────────────┘ │              │              │
│  │  └─────────────────────────────────────────┘              │              │
│  └───────────────────────────────────────────────────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Key Synchronization Mechanisms

### 5.1 Kernel → User Space (Wait Queue)

```c
// Driver (producer)
dev->data_ready = 1;
wake_up_interruptible(&dev->read_queue);

// Server (consumer)
// Blocks until data_ready becomes true
wait_event_interruptible(dev->read_queue, dev->data_ready);
```

### 5.2 Server Threads (Mutex + Condition Variable)

```c
// Acquisition thread (producer)
pthread_mutex_lock(&state->mutex);
state->current_frame = local_frame;
pthread_cond_broadcast(&state->new_frame_cond);
pthread_mutex_unlock(&state->mutex);

// SSE handler thread (consumer)
pthread_mutex_lock(&state->mutex);
pthread_cond_wait(&state->new_frame_cond, &state->mutex);
// ... copy frame ...
pthread_mutex_unlock(&state->mutex);
```

### 5.3 Server → React (SSE Callback)

```typescript
// React (consumer)
eventSource.onmessage = (event) => {
  onDataCallbackRef.current?.(JSON.parse(event.data));
};
```

---

## Part 6: Running the Complete System

```bash
# Terminal 1: Load kernel module (optional, for driver mode)
cd server/linux_virtual_device_driver
sudo insmod sitronix_virtual.ko

# Terminal 2: Start C server
cd server
make
./matrix_server --driver /dev/sitronix_virtual --fps 60
# Or for simulation: ./matrix_server --simulation --fps 60

# Terminal 3: Start React frontend
npm run dev
# Opens http://localhost:3001

# In browser:
# 1. Select "URL Fetch" mode
# 2. Enter URL: http://localhost:3000/stream (or /data for polling)
# 3. Click "Start"
# 4. Observe real-time matrix visualization
```

---

## Summary

| Layer | Component | Data Format | Mechanism |
|-------|-----------|-------------|-----------|
| **Kernel** | Device Driver | 866 bytes binary | Timer + Wait Queue |
| **User Space** | C Server | Binary → JSON | Mutex + Condition Var |
| **Network** | HTTP | SSE (`text/event-stream`) | Persistent Connection |
| **Browser** | React | JSON → Canvas | EventSource + Callback |
