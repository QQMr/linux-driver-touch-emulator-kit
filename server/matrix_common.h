#ifndef MATRIX_COMMON_H
#define MATRIX_COMMON_H

#include <stdint.h>
#include <time.h>

#define ROWS 22
#define COLS 36
#define MAX_TOUCH_POINTS 10

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

#endif
