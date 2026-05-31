.PHONY: build build-server build-driver load run-server run-dev

# Build both the C matrix server and the kernel driver
build: build-server build-driver

build-server:
	$(MAKE) -C server

build-driver:
	$(MAKE) -C server/linux_virtual_device_driver

# Load the kernel module (requires sudo)
load:
	sudo sh server/linux_virtual_device_driver/load.sh

# Run the C matrix server reading from the virtual driver at 60 fps
run-server:
	./server/matrix_server --driver /dev/sitronix_virtual --fps 60

# Start the React/Node.js dev server
run-dev:
	npm run dev
