/*
 * Matrix Server for Live Matrix Canvas
 *
 * A simple HTTP server with SSE streaming that sends JSON frame data with:
 * - 22x36 matrix of simulated values (0-100)
 * - 2 touch points moving from left to right
 * - Server-controlled FPS via SSE (Server-Sent Events)
 *
 * Build: gcc -o matrix_server matrix_server.c -lm
 * Run:   ./matrix_server [fps]
 *        ./matrix_server 30    # Run at 30 FPS
 *        ./matrix_server 60    # Run at 60 FPS
 * Test:  curl http://localhost:3000/stream
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <signal.h>
#include <errno.h>

#define PORT 3000
#define ROWS 22
#define COLS 36
#define BUFFER_SIZE 65536
#define MAX_REQUEST_SIZE 4096
#define DEFAULT_FPS 60

/* Global state */
static double touch_x1 = 0.0;    /* Touch point 1 x position */
static double touch_x2 = 0.3;    /* Touch point 2 x position */
static int frame_count = 0;      /* Frame counter */
static double time_offset = 0.0; /* For wave animation */
static int target_fps = DEFAULT_FPS;
static volatile int running = 1;

/* Signal handler for graceful shutdown */
void handle_signal(int sig) {
    (void)sig;
    running = 0;
}

/* Generate simulated matrix data with wave pattern */
void generate_matrix(int matrix[ROWS][COLS]) {
    time_offset += 0.1;

    for (int r = 0; r < ROWS; r++) {
        for (int c = 0; c < COLS; c++) {
            /* Create a wave pattern based on position and time */
            double wave1 = sin((c * 0.3) + time_offset) * 25;
            double wave2 = cos((r * 0.4) + time_offset * 0.7) * 20;
            double wave3 = sin((c + r) * 0.2 + time_offset * 1.3) * 15;

            /* Combine waves and add some randomness */
            double value = 50 + wave1 + wave2 + wave3 + (rand() % 10 - 5);

            /* Clamp to 0-100 range */
            if (value < 0) value = 0;
            if (value > 100) value = 100;

            matrix[r][c] = (int)value;
        }
    }
}

/* Update touch point positions (left to right movement) */
void update_touch_points(void) {
    /* Move touch points from left to right */
    touch_x1 += 0.015;
    touch_x2 += 0.015;

    /* Wrap around when reaching right edge */
    if (touch_x1 > 1.0) touch_x1 = 0.0;
    if (touch_x2 > 1.0) touch_x2 = 0.0;

    frame_count++;
}

/* Build JSON data string (without SSE wrapper) */
int build_json_data(char *buffer, int buffer_size, int matrix[ROWS][COLS]) {
    int offset = 0;

    /* Start JSON object */
    offset += snprintf(buffer + offset, buffer_size - offset,
        "{\"matrix\":[");

    /* Write matrix rows */
    for (int r = 0; r < ROWS; r++) {
        offset += snprintf(buffer + offset, buffer_size - offset, "[");

        for (int c = 0; c < COLS; c++) {
            if (c > 0) {
                offset += snprintf(buffer + offset, buffer_size - offset, ",");
            }
            offset += snprintf(buffer + offset, buffer_size - offset, "%d", matrix[r][c]);
        }

        offset += snprintf(buffer + offset, buffer_size - offset, "]");
        if (r < ROWS - 1) {
            offset += snprintf(buffer + offset, buffer_size - offset, ",");
        }
    }

    /* Close matrix array */
    offset += snprintf(buffer + offset, buffer_size - offset, "],");

    /* Add touch points - 2 points moving left to right */
    offset += snprintf(buffer + offset, buffer_size - offset,
        "\"touchPoints\":["
        "{\"id\":1,\"x\":%.4f,\"y\":0.3,\"color\":\"#FF6B6B\"},"
        "{\"id\":2,\"x\":%.4f,\"y\":0.7,\"color\":\"#4ECDC4\"}"
        "],",
        touch_x1, touch_x2);

    /* Add message with FPS info */
    offset += snprintf(buffer + offset, buffer_size - offset,
        "\"message\":\"C Server: %d FPS | Frame: %d | Points: (%.2f, 0.3) (%.2f, 0.7)\"}",
        target_fps, frame_count, touch_x1, touch_x2);

    return offset;
}

/* Handle SSE streaming connection */
void handle_sse_stream(int client_fd) {
    char json_buffer[BUFFER_SIZE];
    char sse_buffer[BUFFER_SIZE];
    int matrix[ROWS][COLS];
    int delay_us = 1000000 / target_fps; /* Microseconds between frames */

    /* Send SSE headers */
    const char *sse_headers =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/event-stream\r\n"
        "Cache-Control: no-cache\r\n"
        "Connection: keep-alive\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "\r\n";

    if (write(client_fd, sse_headers, strlen(sse_headers)) < 0) {
        close(client_fd);
        return;
    }

    printf("SSE client connected, streaming at %d FPS...\n", target_fps);

    /* Stream frames continuously */
    while (running) {
        /* Generate new frame data */
        generate_matrix(matrix);
        update_touch_points();

        /* Build JSON data */
        int json_len = build_json_data(json_buffer, sizeof(json_buffer), matrix);

        /* Wrap in SSE format: "data: {...}\n\n" */
        int sse_len = snprintf(sse_buffer, sizeof(sse_buffer),
            "data: %s\n\n", json_buffer);

        /* Send to client */
        ssize_t sent = write(client_fd, sse_buffer, sse_len);
        if (sent < 0) {
            if (errno == EPIPE || errno == ECONNRESET) {
                printf("SSE client disconnected\n");
            } else {
                perror("SSE write error");
            }
            break;
        }

        /* Log every 30 frames */
        if (frame_count % 30 == 0) {
            printf("Frame %d: Streaming at %d FPS, touch points at (%.2f, 0.3) (%.2f, 0.7)\n",
                   frame_count, target_fps, touch_x1, touch_x2);
        }

        /* Wait for next frame */
        usleep(delay_us);
    }

    close(client_fd);
}

/* Handle single JSON request (for /data endpoint) */
void handle_data_request(int client_fd) {
    char json_buffer[BUFFER_SIZE];
    char response_buffer[BUFFER_SIZE];
    int matrix[ROWS][COLS];

    /* Generate data */
    generate_matrix(matrix);
    update_touch_points();

    /* Build JSON response */
    int json_len = build_json_data(json_buffer, sizeof(json_buffer), matrix);

    /* Build HTTP response */
    int header_len = snprintf(response_buffer, sizeof(response_buffer),
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: application/json\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Connection: close\r\n"
        "Content-Length: %d\r\n"
        "\r\n",
        json_len);

    memcpy(response_buffer + header_len, json_buffer, json_len);
    write(client_fd, response_buffer, header_len + json_len);
    close(client_fd);
}

/* Handle incoming HTTP request */
void handle_request(int client_fd) {
    char request[MAX_REQUEST_SIZE];

    /* Read request */
    ssize_t bytes_read = read(client_fd, request, sizeof(request) - 1);
    if (bytes_read <= 0) {
        close(client_fd);
        return;
    }
    request[bytes_read] = '\0';

    /* Check for OPTIONS request (CORS preflight) */
    if (strncmp(request, "OPTIONS", 7) == 0) {
        const char *cors_response =
            "HTTP/1.1 204 No Content\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
            "Access-Control-Allow-Headers: Content-Type\r\n"
            "Connection: close\r\n"
            "\r\n";
        write(client_fd, cors_response, strlen(cors_response));
        close(client_fd);
        return;
    }

    /* Check for GET /stream (SSE endpoint) */
    if (strncmp(request, "GET /stream", 11) == 0) {
        handle_sse_stream(client_fd);
        return;
    }

    /* Check for GET /data or GET / (single JSON response) */
    if (strncmp(request, "GET /data", 9) == 0 || strncmp(request, "GET / ", 6) == 0) {
        handle_data_request(client_fd);
        return;
    }

    /* 404 for other paths */
    const char *not_found =
        "HTTP/1.1 404 Not Found\r\n"
        "Content-Type: text/plain\r\n"
        "Connection: close\r\n"
        "\r\n"
        "Not Found.\n"
        "Endpoints:\n"
        "  GET /data   - Single JSON response\n"
        "  GET /stream - SSE streaming (server-controlled FPS)\n";
    write(client_fd, not_found, strlen(not_found));
    close(client_fd);
}

int main(int argc, char *argv[]) {
    int server_fd, client_fd;
    struct sockaddr_in server_addr, client_addr;
    socklen_t client_len = sizeof(client_addr);

    /* Parse FPS argument */
    if (argc > 1) {
        target_fps = atoi(argv[1]);
        if (target_fps < 1) target_fps = 1;
        if (target_fps > 120) target_fps = 120;
    }

    /* Setup signal handlers */
    signal(SIGINT, handle_signal);
    signal(SIGTERM, handle_signal);
    signal(SIGPIPE, SIG_IGN); /* Ignore broken pipe */

    /* Seed random number generator */
    srand(time(NULL));

    /* Create socket */
    server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket failed");
        exit(EXIT_FAILURE);
    }

    /* Allow address reuse */
    int opt = 1;
    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        perror("setsockopt failed");
        exit(EXIT_FAILURE);
    }

    /* Bind to port */
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(PORT);

    if (bind(server_fd, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        perror("bind failed");
        exit(EXIT_FAILURE);
    }

    /* Listen for connections */
    if (listen(server_fd, 10) < 0) {
        perror("listen failed");
        exit(EXIT_FAILURE);
    }

    printf("==============================================\n");
    printf("  Matrix Server for Live Matrix Canvas\n");
    printf("==============================================\n");
    printf("Server running on http://localhost:%d\n", PORT);
    printf("\n");
    printf("Endpoints:\n");
    printf("  http://localhost:%d/data   - Single JSON\n", PORT);
    printf("  http://localhost:%d/stream - SSE streaming\n", PORT);
    printf("\n");
    printf("Target FPS: %d (change with: ./matrix_server <fps>)\n", target_fps);
    printf("Matrix: %d rows x %d cols\n", ROWS, COLS);
    printf("Touch points: 2 (moving left to right)\n");
    printf("\n");
    printf("Press Ctrl+C to stop\n");
    printf("==============================================\n\n");

    /* Accept connections */
    while (running) {
        client_fd = accept(server_fd, (struct sockaddr *)&client_addr, &client_len);
        if (client_fd < 0) {
            if (running) perror("accept failed");
            continue;
        }

        /* Handle request (single-threaded for simplicity) */
        handle_request(client_fd);
    }

    printf("\nShutting down server...\n");
    close(server_fd);
    return 0;
}
