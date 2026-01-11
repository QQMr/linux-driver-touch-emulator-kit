# Matrix Server Makefile
#
# Build:  make
# Run:    ./matrix_server
# Clean:  make clean

CC = gcc
CFLAGS = -Wall -Wextra -O2
LDFLAGS = -lm

TARGET = matrix_server
SRC = matrix_server.c

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRC) $(LDFLAGS)

clean:
	rm -f $(TARGET)

.PHONY: all clean
