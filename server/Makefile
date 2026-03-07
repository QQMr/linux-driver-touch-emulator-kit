# Matrix Server Makefile
#
# Build:  make
# Run:    ./matrix_server [OPTIONS]
#         ./matrix_server --simulation --fps 60
#         ./matrix_server --driver /dev/sitronix_virtual --fps 60
# Clean:  make clean
# Debug:  make debug

CC = gcc
CFLAGS = -Wall -Wextra -O2
CFLAGS_DEBUG = -Wall -Wextra -g -DDEBUG
LDFLAGS = -lm -lpthread

TARGET = matrix_server
SRC = matrix_server.c sitronix.c
HEADERS = matrix_common.h sitronix.h

all: $(TARGET)

$(TARGET): $(SRC) $(HEADERS)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRC) $(LDFLAGS)

debug: $(SRC) $(HEADERS)
	$(CC) $(CFLAGS_DEBUG) -o $(TARGET) $(SRC) $(LDFLAGS)

clean:
	rm -f $(TARGET)

.PHONY: all clean debug