#!/usr/bin/env python3
"""
Sitronix Touch IC Test Data Generator

Generates binary data in Sitronix format and writes to a named pipe (FIFO)
for testing the matrix_server's read_driver_frame function.

Usage:
    # Terminal 1: Create FIFO and run generator
    mkfifo /tmp/touch_test
    python3 test_sitronix.py /tmp/touch_test 60

    # Terminal 2: Run server
    ./matrix_server --driver /tmp/touch_test --fps 60

    # Terminal 3: View output
    curl -N http://localhost:3000/stream

Sitronix Frame Format (866 bytes):
    Header (4 bytes):
        0x0010: Advanced Touch Info [RstChip|ProxStatus|WithCoord|WithProxRaw|Rsvd|Rsvd]
        0x0011: Reserved
        0x0012: Gesture Info
        0x0013: Keys [Rsvd|Key5|Key4|Key3|Key2|Key1|Key0]
    Touch Data (70 bytes = 10 points x 7 bytes):
        Each point: XH[Valid|Rsvd|X(13:8)], XL[X(7:0)], YH[Rsvd|Y(13:8)], YL[Y(7:0)], Area, Intensity, Rsvd
    Matrix Data (792 bytes = 22 x 36 uint8)
"""

import time
import sys
import math
import signal

# Frame format constants
HEADER_SIZE = 4
TOUCH_POINT_SIZE = 7
MAX_TOUCH_POINTS = 10
TOUCH_DATA_SIZE = TOUCH_POINT_SIZE * MAX_TOUCH_POINTS  # 70 bytes
ROWS = 22
COLS = 36
MATRIX_SIZE = ROWS * COLS  # 792 bytes
FRAME_SIZE = HEADER_SIZE + TOUCH_DATA_SIZE + MATRIX_SIZE  # 866 bytes

# Coordinate max (14-bit)
COORD_MAX = 16383

running = True

def signal_handler(sig, frame):
    global running
    print("\nStopping...")
    running = False

def create_touch_point(x, y, area, intensity, valid=True):
    """Create 7-byte touch point data in Sitronix format"""
    if not valid:
        return bytes(7)

    # Clamp coordinates to valid range
    x = max(0, min(x, COORD_MAX))
    y = max(0, min(y, COORD_MAX))

    # X coordinate: Valid(1) | Reserved(1) | X_H(6) , X_L(8)
    x_h = 0x80 | ((x >> 8) & 0x3F)  # Valid bit + high 6 bits
    x_l = x & 0xFF

    # Y coordinate: Reserved(2) | Y_H(6) , Y_L(8)
    y_h = (y >> 8) & 0x3F
    y_l = y & 0xFF

    return bytes([x_h, x_l, y_h, y_l, area, intensity, 0x00])

def create_frame(touch_points, gesture=0, keys=0, matrix_func=None):
    """
    Create a complete Sitronix format frame (866 bytes)

    Args:
        touch_points: List of tuples (x, y, area, intensity) for each touch point
        gesture: Gesture code (0x0012)
        keys: Key status byte (0x0013)
        matrix_func: Optional function(row, col) -> value (0-255)
    """
    # Header (4 bytes)
    adv_touch_info = 0x15  # WithCoord=1, WithProxRaw=1
    header = bytes([adv_touch_info, 0x00, gesture, keys])

    # Touch data (70 bytes)
    touch_data = bytearray(TOUCH_DATA_SIZE)
    for i, tp in enumerate(touch_points):
        if i >= MAX_TOUCH_POINTS:
            break
        x, y, area, intensity = tp
        offset = i * TOUCH_POINT_SIZE
        touch_data[offset:offset + TOUCH_POINT_SIZE] = create_touch_point(x, y, area, intensity)

    # Matrix data (792 bytes)
    if matrix_func:
        matrix = bytearray(MATRIX_SIZE)
        for r in range(ROWS):
            for c in range(COLS):
                matrix[r * COLS + c] = max(0, min(255, matrix_func(r, c)))
    else:
        matrix = bytes([128] * MATRIX_SIZE)  # Default: mid-value

    return header + bytes(touch_data) + bytes(matrix)

def wave_matrix(t):
    """Generate a wave pattern matrix function"""
    def matrix_func(r, c):
        wave1 = math.sin((c * 0.3) + t) * 50
        wave2 = math.cos((r * 0.4) + t * 0.7) * 40
        wave3 = math.sin((c + r) * 0.2 + t * 1.3) * 30
        value = 128 + wave1 + wave2 + wave3
        return int(value)
    return matrix_func

def print_usage():
    print("Usage: python3 test_sitronix.py <fifo_path> [fps]")
    print()
    print("Arguments:")
    print("  fifo_path  Path to named pipe (FIFO) to write data to")
    print("  fps        Frames per second (default: 60)")
    print()
    print("Example:")
    print("  mkfifo /tmp/touch_test")
    print("  python3 test_sitronix.py /tmp/touch_test 60")
    print()
    print("Then run server:")
    print("  ./matrix_server --driver /tmp/touch_test --fps 60")

def main():
    global running

    if len(sys.argv) < 2 or sys.argv[1] in ['-h', '--help']:
        print_usage()
        sys.exit(0)

    fifo_path = sys.argv[1]
    fps = int(sys.argv[2]) if len(sys.argv) > 2 else 60

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print(f"Sitronix Test Data Generator")
    print(f"============================")
    print(f"FIFO path: {fifo_path}")
    print(f"Target FPS: {fps}")
    print(f"Frame size: {FRAME_SIZE} bytes")
    print()
    print("Generating 2 touch points moving in circular pattern...")
    print("Press Ctrl+C to stop")
    print()

    frame_count = 0
    t = 0.0
    dt = 0.05

    try:
        with open(fifo_path, 'wb', buffering=0) as f:
            print(f"Connected to {fifo_path}")

            while running:
                # Generate two touch points in circular motion
                # Point 1: Circle in upper-left quadrant
                x1 = int(4000 + 3000 * math.cos(t))
                y1 = int(4000 + 3000 * math.sin(t))

                # Point 2: Circle in lower-right quadrant
                x2 = int(12000 + 3000 * math.cos(t * 1.5 + math.pi))
                y2 = int(12000 + 3000 * math.sin(t * 1.5 + math.pi))

                touch_points = [
                    (x1, y1, 50, 80),   # Point 1: area=50, intensity=80
                    (x2, y2, 60, 90),   # Point 2: area=60, intensity=90
                ]

                # Create frame with wave pattern matrix
                frame = create_frame(touch_points, matrix_func=wave_matrix(t))

                try:
                    f.write(frame)
                except BrokenPipeError:
                    print("Reader disconnected")
                    break

                frame_count += 1
                t += dt

                if frame_count % fps == 0:
                    print(f"Frame {frame_count}: TP1=({x1}, {y1}) TP2=({x2}, {y2})")

                time.sleep(1.0 / fps)

    except FileNotFoundError:
        print(f"Error: FIFO not found at {fifo_path}")
        print(f"Create it first with: mkfifo {fifo_path}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    print(f"\nTotal frames sent: {frame_count}")

if __name__ == "__main__":
    main()
