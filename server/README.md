# Matrix Server

A C HTTP server that sends JSON frame data to the Live Matrix Canvas React app.

## Features

- HTTP server on port 3000
- 22x36 matrix with wave pattern simulation
- 2 touch points moving left to right
- CORS headers for browser compatibility

## Build

### Linux/WSL

```bash
# Install gcc if needed
sudo apt-get install gcc

# Compile
make
# or
gcc -o matrix_server matrix_server.c -lm
```

### Windows (MinGW)

```bash
gcc -o matrix_server.exe matrix_server.c -lws2_32
```

### macOS

```bash
gcc -o matrix_server matrix_server.c -lm
```

## Run

```bash
./matrix_server
```

Output:
```
===========================================
  Matrix Server for Live Matrix Canvas
===========================================
Server running on http://localhost:3000
Endpoint: http://localhost:3000/data

Matrix: 22 rows x 36 cols
Touch points: 2 (moving left to right)

Press Ctrl+C to stop
===========================================
```

## Test

```bash
curl http://localhost:3000/data | jq .
```

## Use with React App

1. Start this server: `./matrix_server`
2. Start React app: `npm run dev` (in parent directory)
3. In React app:
   - Click "URL Fetch" mode
   - URL is already set to `http://localhost:3000/data`
   - Watch the matrix update with animated touch points

## JSON Format

```json
{
  "matrix": [[0-100, ...], ...],  // 22 rows x 36 cols
  "touchPoints": [
    {"id": 1, "x": 0.0-1.0, "y": 0.3, "color": "#FF6B6B"},
    {"id": 2, "x": 0.0-1.0, "y": 0.7, "color": "#4ECDC4"}
  ],
  "message": "C Server: Running | Frame: 123"
}
```
