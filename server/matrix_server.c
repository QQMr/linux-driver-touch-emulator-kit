/*
 * Matrix Server for Live Matrix Canvas
 *
 * A threaded HTTP server with SSE streaming that sends JSON frame data with:
 * - 22x36 matrix of values (0-100)
 * - Up to 10 touch points
 * - Server-controlled FPS via SSE (Server-Sent Events)
 *
 * Data acquisition runs in a separate thread, supporting:
 * - Simulation mode: Procedural wave patterns
 * - Driver mode: Read binary data from Linux device file
 *
 * Build: make (or: gcc -o matrix_server matrix_server.c -lm -lpthread)
 * Run:   ./matrix_server [OPTIONS]
 *        ./matrix_server --simulation --fps 60
 *        ./matrix_server --driver /dev/touchmatrix --fps 60
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
#include <pthread.h>
#include <fcntl.h>
#include <stdint.h>

#define PORT 3000
#define ROWS 22
#define COLS 36
#define BUFFER_SIZE 65536
#define MAX_REQUEST_SIZE 4096
#define DEFAULT_FPS 60
#define MAX_TOUCH_POINTS 10

/* Sitronix Touch IC binary format sizes */
#define SITRONIX_HEADER_SIZE 4          /* 0x0010-0x0013: AdvTouchInfo, Reserved, Gestures, Keys */
#define SITRONIX_TOUCH_POINT_SIZE 7     /* Per touch: XH, XL, YH, YL, Area, Intensity, Reserved */
#define SITRONIX_TOUCH_DATA_SIZE 70     /* 10 touch points x 7 bytes = 70 bytes */
#define MATRIX_DATA_SIZE 792            /* 22 x 36 x uint8 = 792 bytes */
#define DRIVER_FRAME_SIZE 866           /* Total: 4 + 70 + 792 = 866 bytes */

/* Sitronix touch point coordinate limits (14-bit values: 6 high + 8 low) */
#define SITRONIX_COORD_MAX 16383        /* 2^14 - 1 */

/* Data source mode */
typedef enum {
    MODE_SIMULATION,
    MODE_DRIVER
} DataSourceMode;

/* Server configuration */
typedef struct {
    DataSourceMode mode;
    char device_path[256];
    int target_fps;
} ServerConfig;

/* Touch point data */
typedef struct {
    int id;
    double x;       /* Normalized 0.0-1.0 */
    double y;       /* Normalized 0.0-1.0 */
    int active;
    uint8_t area;       /* Touch area from Sitronix */
    uint8_t intensity;  /* Touch intensity from Sitronix */
} TouchPoint;

/* Frame data (shared buffer) */
typedef struct {
    int matrix[ROWS][COLS];
    TouchPoint touch_points[MAX_TOUCH_POINTS];
    int touch_count;
    int frame_number;
    struct timespec timestamp;
    /* Sitronix header info */
    uint8_t adv_touch_info;     /* 0x0010: RstChip, ProxStatus, WithCoord, WithProxRaw */
    uint8_t gesture_info;       /* 0x0012: Gesture code */
    uint8_t keys;               /* 0x0013: Key0-Key5 status */
} FrameData;

/* Shared state between threads */
typedef struct {
    FrameData current_frame;
    pthread_mutex_t mutex;
    pthread_cond_t new_frame_cond;
    volatile int running;
    ServerConfig config;

    /* Statistics */
    unsigned long frames_acquired;
    unsigned long frames_dropped;

    /* Simulation state */
    double time_offset;
    double sim_touch_x[MAX_TOUCH_POINTS];
} SharedState;

/* Global pointer for signal handler */
static SharedState *g_state = NULL;

/* Forward declaration for Sitronix parser (defined later) */
int parse_sitronix_buffer(const uint8_t *buffer, FrameData *frame);

/* Touch point colors */
static const char *touch_colors[] = {
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
    "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"
};

/* Signal handler for graceful shutdown */
void handle_signal(int sig) {
    (void)sig;
    if (g_state) {
        g_state->running = 0;
        pthread_cond_broadcast(&g_state->new_frame_cond);
    }
}

/* Print usage information */
void print_usage(const char *prog_name) {
    printf("Usage: %s [OPTIONS]\n\n", prog_name);
    printf("Options:\n");
    printf("  --simulation        Use simulated data (default)\n");
    printf("  --driver <path>     Read from Linux device file\n");
    printf("  --fps <rate>        Target FPS (1-120, default: 60)\n");
    printf("  --help              Show this help message\n");
    printf("\nExamples:\n");
    printf("  %s --simulation --fps 30\n", prog_name);
    printf("  %s --driver /dev/touchmatrix --fps 60\n", prog_name);
    printf("\nSitronix driver binary format (%d bytes per frame):\n", DRIVER_FRAME_SIZE);
    printf("  Header (4 bytes):\n");
    printf("    0x0010: Advanced Touch Info [RstChip|ProxStatus|WithCoord|WithProxRaw|Rsvd|Rsvd]\n");
    printf("    0x0011: Reserved\n");
    printf("    0x0012: Gesture Info\n");
    printf("    0x0013: Keys [Rsvd|Key5|Key4|Key3|Key2|Key1|Key0]\n");
    printf("  Touch data (70 bytes = 10 points x 7 bytes):\n");
    printf("    Each point: XH[Valid|Rsvd|X(13:8)], XL[X(7:0)], YH[Rsvd|Y(13:8)], YL[Y(7:0)], Area, Intensity, Rsvd\n");
    printf("  Matrix data: 22 x 36 x uint8 = 792 bytes\n");
}

/* Parse command-line arguments */
int parse_arguments(int argc, char *argv[], ServerConfig *config) {
    /* Set defaults */
    config->mode = MODE_SIMULATION;
    config->device_path[0] = '\0';
    config->target_fps = DEFAULT_FPS;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--simulation") == 0) {
            config->mode = MODE_SIMULATION;
        }
        else if (strcmp(argv[i], "--driver") == 0) {
            if (i + 1 >= argc) {
                fprintf(stderr, "Error: --driver requires a device path\n");
                return -1;
            }
            config->mode = MODE_DRIVER;
            strncpy(config->device_path, argv[++i], sizeof(config->device_path) - 1);
            config->device_path[sizeof(config->device_path) - 1] = '\0';
        }
        else if (strcmp(argv[i], "--fps") == 0) {
            if (i + 1 >= argc) {
                fprintf(stderr, "Error: --fps requires a numeric value\n");
                return -1;
            }
            config->target_fps = atoi(argv[++i]);
            if (config->target_fps < 1) config->target_fps = 1;
            if (config->target_fps > 120) config->target_fps = 120;
        }
        else if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            print_usage(argv[0]);
            exit(0);
        }
        else {
            /* Legacy: bare number is FPS */
            int fps = atoi(argv[i]);
            if (fps > 0) {
                config->target_fps = fps;
                if (config->target_fps > 120) config->target_fps = 120;
            } else {
                fprintf(stderr, "Unknown option: %s\n", argv[i]);
                return -1;
            }
        }
    }

    return 0;
}

/* Generate simulated frame data */
void generate_simulation_frame(SharedState *state, FrameData *frame) {
    state->time_offset += 0.1;

    /* Generate matrix with wave pattern */
    for (int r = 0; r < ROWS; r++) {
        for (int c = 0; c < COLS; c++) {
            double wave1 = sin((c * 0.3) + state->time_offset) * 25;
            double wave2 = cos((r * 0.4) + state->time_offset * 0.7) * 20;
            double wave3 = sin((c + r) * 0.2 + state->time_offset * 1.3) * 15;

            double value = 50 + wave1 + wave2 + wave3 + (rand() % 10 - 5);

            if (value < 0) value = 0;
            if (value > 100) value = 100;

            frame->matrix[r][c] = (int)value;
        }
    }

    /* Update simulated touch points (2 points moving left to right) */
    frame->touch_count = 2;

    state->sim_touch_x[0] += 0.015;
    state->sim_touch_x[1] += 0.015;
    if (state->sim_touch_x[0] > 1.0) state->sim_touch_x[0] = 0.0;
    if (state->sim_touch_x[1] > 1.0) state->sim_touch_x[1] = 0.0;

    frame->touch_points[0].id = 1;
    frame->touch_points[0].x = state->sim_touch_x[0];
    frame->touch_points[0].y = 0.3;
    frame->touch_points[0].active = 1;
    frame->touch_points[0].area = 50;
    frame->touch_points[0].intensity = 80;

    frame->touch_points[1].id = 2;
    frame->touch_points[1].x = state->sim_touch_x[1];
    frame->touch_points[1].y = 0.7;
    frame->touch_points[1].active = 1;
    frame->touch_points[1].area = 45;
    frame->touch_points[1].intensity = 75;

    /* Initialize Sitronix header fields for simulation */
    frame->adv_touch_info = 0x00;
    frame->gesture_info = 0x00;
    frame->keys = 0x00;

    clock_gettime(CLOCK_MONOTONIC, &frame->timestamp);
}

/*
 * Read and parse one frame from driver device file (Sitronix Touch IC format)
 *
 * Sitronix Register Map (Report Page):
 * -----------------------------------------------
 * 0x0010: Advanced Touch Info (RO)
 *         [RstChip | ProxStatus | WithCoord | WithProxRaw | Reserved | Reserved]
 * 0x0011: Reserved
 * 0x0012: Gesture Info (RO) - Gesture code
 * 0x0013: Keys [Reserved | Key5 | Key4 | Key3 | Key2 | Key1 | Key0]
 *
 * 0x0014-0x001A: Touch Point 0 (7 bytes)
 *   0x0014: X0 High [Valid0 | Reserved | X0_H(5:0)]
 *   0x0015: X0 Low  [X0_L(7:0)]
 *   0x0016: Y0 High [Reserved | Reserved | Y0_H(5:0)]
 *   0x0017: Y0 Low  [Y0_L(7:0)]
 *   0x0018: Touch Area 0
 *   0x0019: Touch Intensity 0
 *   0x001A: Reserved
 *
 * 0x001B-0x0021: Touch Point 1 (7 bytes)
 * ... (same pattern)
 * 0x0053-0x0059: Touch Point 9 (7 bytes)
 *
 * Then matrix/proximity raw data follows...
 */
int read_driver_frame(int fd, FrameData *frame) {
    uint8_t buffer[DRIVER_FRAME_SIZE];

    /* Read entire frame */
    ssize_t bytes_read = read(fd, buffer, DRIVER_FRAME_SIZE);
    if (bytes_read != DRIVER_FRAME_SIZE) {
        if (bytes_read < 0) {
            perror("Driver read error");
        } else if (bytes_read > 0) {
            fprintf(stderr, "Incomplete frame: %zd bytes (expected %d)\n",
                    bytes_read, DRIVER_FRAME_SIZE);
        }
        return -1;
    }

    return parse_sitronix_buffer(buffer, frame);
}

/* Data acquisition thread function */
void *data_acquisition_thread(void *arg) {
    SharedState *state = (SharedState *)arg;
    FrameData local_frame;
    int driver_fd = -1;
    int delay_us = 1000000 / state->config.target_fps;

    printf("Data acquisition thread started (mode: %s, %d FPS)\n",
           state->config.mode == MODE_SIMULATION ? "simulation" : "driver",
           state->config.target_fps);

    /* Open driver device if in driver mode */
    if (state->config.mode == MODE_DRIVER) {
        driver_fd = open(state->config.device_path, O_RDONLY);
        if (driver_fd < 0) {
            perror("Failed to open device");
            fprintf(stderr, "Device path: %s\n", state->config.device_path);
            state->running = 0;
            return NULL;
        }
        printf("Opened device: %s\n", state->config.device_path);
    }

    /* Use precise timing with clock_nanosleep */
    struct timespec next_frame_time;
    clock_gettime(CLOCK_MONOTONIC, &next_frame_time);

    while (state->running) {
        int acquire_success = 0;

        /* Acquire frame data based on mode */
        if (state->config.mode == MODE_SIMULATION) {
            generate_simulation_frame(state, &local_frame);
            acquire_success = 1;
        } else {
            acquire_success = (read_driver_frame(driver_fd, &local_frame) == 0);
        }

        if (acquire_success) {
            /* Update shared buffer with mutex protection */
            pthread_mutex_lock(&state->mutex);

            local_frame.frame_number = state->frames_acquired++;
            memcpy(&state->current_frame, &local_frame, sizeof(FrameData));

            pthread_cond_broadcast(&state->new_frame_cond);
            pthread_mutex_unlock(&state->mutex);
        } else {
            state->frames_dropped++;
        }

        /* Precise timing for target FPS */
        next_frame_time.tv_nsec += delay_us * 1000;
        while (next_frame_time.tv_nsec >= 1000000000) {
            next_frame_time.tv_nsec -= 1000000000;
            next_frame_time.tv_sec++;
        }

        clock_nanosleep(CLOCK_MONOTONIC, TIMER_ABSTIME, &next_frame_time, NULL);
    }

    if (driver_fd >= 0) {
        close(driver_fd);
    }

    printf("Data acquisition thread stopped\n");
    return NULL;
}

/* Build JSON data string from FrameData */
int build_json_data(char *buffer, int buffer_size, const FrameData *frame,
                    const ServerConfig *config) {
    int offset = 0;

    /* Start JSON object with matrix */
    offset += snprintf(buffer + offset, buffer_size - offset, "{\"matrix\":[");

    /* Write matrix rows */
    for (int r = 0; r < ROWS; r++) {
        offset += snprintf(buffer + offset, buffer_size - offset, "[");

        for (int c = 0; c < COLS; c++) {
            if (c > 0) {
                offset += snprintf(buffer + offset, buffer_size - offset, ",");
            }
            offset += snprintf(buffer + offset, buffer_size - offset, "%d",
                              frame->matrix[r][c]);
        }

        offset += snprintf(buffer + offset, buffer_size - offset, "]");
        if (r < ROWS - 1) {
            offset += snprintf(buffer + offset, buffer_size - offset, ",");
        }
    }

    /* Close matrix array */
    offset += snprintf(buffer + offset, buffer_size - offset, "],");

    /* Add touch points */
    offset += snprintf(buffer + offset, buffer_size - offset, "\"touchPoints\":[");

    for (int i = 0; i < frame->touch_count; i++) {
        if (i > 0) {
            offset += snprintf(buffer + offset, buffer_size - offset, ",");
        }

        const char *color = touch_colors[(frame->touch_points[i].id - 1) % MAX_TOUCH_POINTS];

        offset += snprintf(buffer + offset, buffer_size - offset,
            "{\"id\":%d,\"x\":%.4f,\"y\":%.4f,\"color\":\"%s\"}",
            frame->touch_points[i].id,
            frame->touch_points[i].x,
            frame->touch_points[i].y,
            color);
    }

    offset += snprintf(buffer + offset, buffer_size - offset, "],");

    /* Add message with mode and FPS info */
    offset += snprintf(buffer + offset, buffer_size - offset,
        "\"message\":\"C Server [%s]: %d FPS | Frame: %d | Touch: %d pts\"}",
        config->mode == MODE_SIMULATION ? "SIM" : "DRV",
        config->target_fps,
        frame->frame_number,
        frame->touch_count);

    return offset;
}

/* Handle SSE streaming connection */
void handle_sse_stream(int client_fd, SharedState *state) {
    char json_buffer[BUFFER_SIZE];
    char sse_buffer[BUFFER_SIZE];
    FrameData local_frame;
    int last_frame_number = -1;

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

    printf("SSE client connected, streaming at %d FPS...\n",
           state->config.target_fps);

    /* Stream frames continuously */
    while (state->running) {
        /* Wait for new frame with mutex */
        pthread_mutex_lock(&state->mutex);

        /* Wait until we have a new frame */
        while (state->running &&
               state->current_frame.frame_number == last_frame_number) {
            /* Timeout after 1 second to check running flag */
            struct timespec timeout;
            clock_gettime(CLOCK_REALTIME, &timeout);
            timeout.tv_sec += 1;
            pthread_cond_timedwait(&state->new_frame_cond, &state->mutex, &timeout);
        }

        if (!state->running) {
            pthread_mutex_unlock(&state->mutex);
            break;
        }

        /* Copy frame data while holding mutex */
        memcpy(&local_frame, &state->current_frame, sizeof(FrameData));
        last_frame_number = local_frame.frame_number;

        pthread_mutex_unlock(&state->mutex);

        /* Build and send JSON (outside mutex) */
        (void)build_json_data(json_buffer, sizeof(json_buffer),
                              &local_frame, &state->config);

        int sse_len = snprintf(sse_buffer, sizeof(sse_buffer),
            "data: %s\n\n", json_buffer);

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
        if (local_frame.frame_number % 30 == 0) {
            printf("Frame %d: Streaming, %d touch points\n",
                   local_frame.frame_number, local_frame.touch_count);
        }
    }

    close(client_fd);
}

/* Handle single JSON request (for /data endpoint) */
void handle_data_request(int client_fd, SharedState *state) {
    char json_buffer[BUFFER_SIZE];
    char response_buffer[BUFFER_SIZE];
    FrameData local_frame;

    /* Copy current frame with mutex protection */
    pthread_mutex_lock(&state->mutex);
    memcpy(&local_frame, &state->current_frame, sizeof(FrameData));
    pthread_mutex_unlock(&state->mutex);

    /* Build JSON response */
    int json_len = build_json_data(json_buffer, sizeof(json_buffer),
                                   &local_frame, &state->config);

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
    if (write(client_fd, response_buffer, header_len + json_len) < 0) {
        /* Connection already closed, ignore */
    }
    close(client_fd);
}

/* Handle incoming HTTP request */
void handle_request(int client_fd, SharedState *state) {
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
        if (write(client_fd, cors_response, strlen(cors_response)) < 0) {
            /* Ignore */
        }
        close(client_fd);
        return;
    }

    /* Check for GET /stream (SSE endpoint) */
    if (strncmp(request, "GET /stream", 11) == 0) {
        handle_sse_stream(client_fd, state);
        return;
    }

    /* Check for GET /data or GET / (single JSON response) */
    if (strncmp(request, "GET /data", 9) == 0 || strncmp(request, "GET / ", 6) == 0) {
        handle_data_request(client_fd, state);
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
    if (write(client_fd, not_found, strlen(not_found)) < 0) {
        /* Ignore */
    }
    close(client_fd);
}

/*
 * Parse Sitronix frame data from buffer (used by read_driver_frame and test)
 */
int parse_sitronix_buffer(const uint8_t *buffer, FrameData *frame) {
    /* Parse Sitronix header (4 bytes at offset 0) */
    frame->adv_touch_info = buffer[0];  /* 0x0010: Advanced Touch Info */
    /* buffer[1] is reserved (0x0011) */
    frame->gesture_info = buffer[2];    /* 0x0012: Gesture Info */
    frame->keys = buffer[3];            /* 0x0013: Keys */

    /* Parse touch points (10 points x 7 bytes each, starting at offset 4) */
    const uint8_t *touch_data = buffer + SITRONIX_HEADER_SIZE;
    frame->touch_count = 0;

    for (int i = 0; i < MAX_TOUCH_POINTS; i++) {
        const uint8_t *tp = touch_data + (i * SITRONIX_TOUCH_POINT_SIZE);

        /* Byte 0: X High - bit 7 is Valid flag, bits 5-0 are X_H */
        uint8_t x_high = tp[0];
        int valid = (x_high >> 7) & 0x01;  /* Valid bit is bit 7 */

        if (valid) {
            /* Extract X coordinate (14-bit: 6 high + 8 low) */
            uint16_t x_h = x_high & 0x3F;       /* bits 5-0 */
            uint16_t x_l = tp[1];               /* full 8 bits */
            uint16_t raw_x = (x_h << 8) | x_l;

            /* Extract Y coordinate (14-bit: 6 high + 8 low) */
            uint8_t y_high = tp[2];
            uint16_t y_h = y_high & 0x3F;      /* bits 5-0 */
            uint16_t y_l = tp[3];              /* full 8 bits */
            uint16_t raw_y = (y_h << 8) | y_l;

            /* Extract touch area and intensity */
            uint8_t area = tp[4];
            uint8_t intensity = tp[5];
            /* tp[6] is reserved */

            /* Store touch point with normalized coordinates */
            frame->touch_points[frame->touch_count].id = i + 1;
            frame->touch_points[frame->touch_count].x = (double)raw_x / SITRONIX_COORD_MAX;
            frame->touch_points[frame->touch_count].y = (double)raw_y / SITRONIX_COORD_MAX;
            frame->touch_points[frame->touch_count].active = 1;
            frame->touch_points[frame->touch_count].area = area;
            frame->touch_points[frame->touch_count].intensity = intensity;
            frame->touch_count++;
        }
    }

    /* Parse matrix data (22x36 uint8 values, after header + touch data) */
    const uint8_t *matrix_data = buffer + SITRONIX_HEADER_SIZE + SITRONIX_TOUCH_DATA_SIZE;
    for (int r = 0; r < ROWS; r++) {
        for (int c = 0; c < COLS; c++) {
            /* Scale from 0-255 to 0-100 */
            frame->matrix[r][c] = (matrix_data[r * COLS + c] * 100) / 255;
        }
    }

    clock_gettime(CLOCK_MONOTONIC, &frame->timestamp);
    return 0;
}

int main(int argc, char *argv[]) {
    SharedState state;
    pthread_t acq_thread;
    int server_fd, client_fd;
    struct sockaddr_in server_addr, client_addr;
    socklen_t client_len = sizeof(client_addr);

    /* Initialize shared state */
    memset(&state, 0, sizeof(state));
    state.running = 1;
    state.sim_touch_x[0] = 0.0;
    state.sim_touch_x[1] = 0.3;

    /* Parse command-line arguments */
    if (parse_arguments(argc, argv, &state.config) < 0) {
        print_usage(argv[0]);
        return EXIT_FAILURE;
    }

    /* Initialize mutex and condition variable */
    if (pthread_mutex_init(&state.mutex, NULL) != 0) {
        perror("Mutex init failed");
        return EXIT_FAILURE;
    }
    if (pthread_cond_init(&state.new_frame_cond, NULL) != 0) {
        perror("Condition variable init failed");
        pthread_mutex_destroy(&state.mutex);
        return EXIT_FAILURE;
    }

    /* Setup signal handlers */
    g_state = &state;
    signal(SIGINT, handle_signal);
    signal(SIGTERM, handle_signal);
    signal(SIGPIPE, SIG_IGN);

    /* Seed random number generator */
    srand(time(NULL));

    /* Start data acquisition thread */
    if (pthread_create(&acq_thread, NULL, data_acquisition_thread, &state) != 0) {
        perror("Failed to create acquisition thread");
        pthread_mutex_destroy(&state.mutex);
        pthread_cond_destroy(&state.new_frame_cond);
        return EXIT_FAILURE;
    }

    /* Create socket */
    server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket failed");
        state.running = 0;
        pthread_join(acq_thread, NULL);
        return EXIT_FAILURE;
    }

    /* Allow address reuse */
    int opt = 1;
    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        perror("setsockopt failed");
        state.running = 0;
        pthread_join(acq_thread, NULL);
        close(server_fd);
        return EXIT_FAILURE;
    }

    /* Bind to port */
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(PORT);

    if (bind(server_fd, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        perror("bind failed");
        state.running = 0;
        pthread_join(acq_thread, NULL);
        close(server_fd);
        return EXIT_FAILURE;
    }

    /* Listen for connections */
    if (listen(server_fd, 10) < 0) {
        perror("listen failed");
        state.running = 0;
        pthread_join(acq_thread, NULL);
        close(server_fd);
        return EXIT_FAILURE;
    }

    /* Print startup banner */
    printf("==============================================\n");
    printf("  Matrix Server for Live Matrix Canvas\n");
    printf("==============================================\n");
    printf("Mode: %s\n", state.config.mode == MODE_SIMULATION ?
           "Simulation" : state.config.device_path);
    printf("Target FPS: %d\n", state.config.target_fps);
    printf("Matrix: %d rows x %d cols\n", ROWS, COLS);
    printf("Touch points: up to %d\n", MAX_TOUCH_POINTS);
    printf("\nEndpoints:\n");
    printf("  http://localhost:%d/data   - Single JSON\n", PORT);
    printf("  http://localhost:%d/stream - SSE streaming\n", PORT);
    printf("\nPress Ctrl+C to stop\n");
    printf("==============================================\n\n");

    /* Accept connections */
    while (state.running) {
        client_fd = accept(server_fd, (struct sockaddr *)&client_addr, &client_len);
        if (client_fd < 0) {
            if (state.running && errno != EINTR) perror("accept failed");
            continue;
        }

        handle_request(client_fd, &state);
    }

    /* Cleanup */
    printf("\nShutting down...\n");
    close(server_fd);

    /* Wait for acquisition thread to finish */
    pthread_join(acq_thread, NULL);

    /* Print statistics */
    printf("Frames acquired: %lu\n", state.frames_acquired);
    printf("Frames dropped: %lu\n", state.frames_dropped);

    pthread_mutex_destroy(&state.mutex);
    pthread_cond_destroy(&state.new_frame_cond);

    printf("Server stopped.\n");
    return 0;
}
