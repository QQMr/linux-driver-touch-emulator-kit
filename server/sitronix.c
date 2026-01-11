#include "sitronix.h"
#include <stdio.h>
#include <unistd.h>
#include <time.h>

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
