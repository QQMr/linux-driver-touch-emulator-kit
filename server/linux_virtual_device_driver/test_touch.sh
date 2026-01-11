#!/bin/bash
# Test touch event reporting
# Usage: sudo ./test_touch.sh [seconds]

SYSFS_PATH="/sys/class/sitronix/sitronix_virtual/enable_touch"
DURATION=${1:-10}  # Default 10 seconds

if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root"
   exit 1
fi

if [[ ! -f "$SYSFS_PATH" ]]; then
    echo "Error: Driver not loaded. Run 'sudo ./load.sh' first."
    exit 1
fi

echo "=== Touch Event Test ==="
echo "Duration: ${DURATION}s"
echo ""

# Enable touch
echo "Enabling touch event reporting..."
echo 1 > "$SYSFS_PATH"
echo "enable_touch = $(cat $SYSFS_PATH)"

# Wait
echo "Waiting ${DURATION} seconds..."
sleep "$DURATION"

# Disable touch
echo "Disabling touch event reporting..."
echo 0 > "$SYSFS_PATH"
echo "enable_touch = $(cat $SYSFS_PATH)"

echo ""
echo "=== Test Complete ==="
