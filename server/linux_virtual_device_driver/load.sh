#!/bin/bash
# Load the virtual Sitronix driver
# Usage: sudo ./load.sh

if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root" 
   exit 1
fi

# Unload if already loaded
if lsmod | grep -q "sitronix_virtual"; then
    rmmod sitronix_virtual
fi

# Insert module
if insmod sitronix_virtual.ko; then
    echo "Module loaded."
    # Set permissions so we can read it without sudo for testing
    chmod 666 /dev/sitronix_virtual
    ls -l /dev/sitronix_virtual
else
    echo "Failed to load module. Did you run 'make'?"
fi
