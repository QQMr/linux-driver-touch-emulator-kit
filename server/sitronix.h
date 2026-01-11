#ifndef SITRONIX_H
#define SITRONIX_H

#include "matrix_common.h"
#include <stdint.h>

/* Sitronix Touch IC binary format sizes */
#define SITRONIX_HEADER_SIZE 4          /* 0x0010-0x0013: AdvTouchInfo, Reserved, Gestures, Keys */
#define SITRONIX_TOUCH_POINT_SIZE 7     /* Per touch: XH, XL, YH, YL, Area, Intensity, Reserved */
#define SITRONIX_TOUCH_DATA_SIZE 70     /* 10 touch points x 7 bytes = 70 bytes */
#define MATRIX_DATA_SIZE 792            /* 22 x 36 x uint8 = 792 bytes */
#define DRIVER_FRAME_SIZE 866           /* Total: 4 + 70 + 792 = 866 bytes */

/* Sitronix touch point coordinate limits (14-bit values: 6 high + 8 low) */
#define SITRONIX_COORD_MAX 16383        /* 2^14 - 1 */

int read_driver_frame(int fd, FrameData *frame);
int parse_sitronix_buffer(const uint8_t *buffer, FrameData *frame);

#endif
