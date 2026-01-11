#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/init.h>
#include <linux/fs.h>
#include <linux/cdev.h>
#include <linux/uaccess.h>
#include <linux/slab.h>
#include <linux/mutex.h>
#include <linux/timer.h>
#include <linux/wait.h>
#include <linux/sched.h>
#include <linux/device.h>
#include <linux/version.h> /* Handle version differences */

#define DRIVER_NAME "sitronix_virtual"
#define CLASS_NAME "sitronix"

/* Sitronix Data Constants */
#define ROWS 22
#define COLS 36
#define MAX_TOUCH_POINTS 10
#define SITRONIX_HEADER_SIZE 4
#define SITRONIX_TOUCH_POINT_SIZE 7
#define SITRONIX_TOUCH_DATA_SIZE (MAX_TOUCH_POINTS * SITRONIX_TOUCH_POINT_SIZE)
#define MATRIX_DATA_SIZE (ROWS * COLS)
#define FRAME_SIZE (SITRONIX_HEADER_SIZE + SITRONIX_TOUCH_DATA_SIZE + MATRIX_DATA_SIZE) /* 866 */

#define UPDATE_INTERVAL_MS 60

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Gemini Assistant");
MODULE_DESCRIPTION("Virtual Sitronix Touch Matrix Driver");
MODULE_VERSION("1.1");

/* Device State */
struct sitronix_dev {
    dev_t dev_num;
    struct cdev cdev;
    struct class *class;
    struct device *device;
    
    struct mutex mutex;
    wait_queue_head_t read_queue;
    struct timer_list timer;
    
    uint8_t frame_buffer[FRAME_SIZE];
    int data_ready;
    unsigned long sequence;
    
    /* Simulation state */
    int sim_x;
    int sim_y;
    int sim_dir_x;
    int sim_dir_y;
};

static struct sitronix_dev *s_dev = NULL;

/* Helper to write a touch point to buffer */
static void write_touch_point(uint8_t *buf, int id, int x, int y, int area, int intensity) {
    if (x < 0) x = 0; if (x > 16383) x = 16383;
    if (y < 0) y = 0; if (y > 16383) y = 16383;
    
    /* 
     * Byte 0: X High [Valid(1)|Rsvd(1)|X(13:8)]
     * Byte 1: X Low  [X(7:0)]
     * Byte 2: Y High [Rsvd(2)|Y(13:8)]
     * Byte 3: Y Low  [Y(7:0)]
     */
    buf[0] = 0x80 | ((x >> 8) & 0x3F); /* Set Valid bit (bit 7) */
    buf[1] = x & 0xFF;
    buf[2] = (y >> 8) & 0x3F;
    buf[3] = y & 0xFF;
    buf[4] = area;
    buf[5] = intensity;
    buf[6] = 0; /* Reserved */
}

/* Timer Callback - Generate Data */
static void sitronix_timer_callback(struct timer_list *t) {
    struct sitronix_dev *dev = from_timer(dev, t, timer);
    int r, c;
    uint8_t *matrix_ptr;
    
    mutex_lock(&dev->mutex);
    
    /* 1. Clear Buffer */
    memset(dev->frame_buffer, 0, FRAME_SIZE);
    
    /* 2. Header (Advanced Touch Info) */
    dev->frame_buffer[0] = 0x00; /* Normal */
    dev->frame_buffer[1] = 0x00; /* Reserved */
    dev->frame_buffer[2] = 0x00; /* No Gesture */
    dev->frame_buffer[3] = 0x00; /* No Keys */
    
    /* 3. Update Simulation State (Bouncing Ball) */
    dev->sim_x += dev->sim_dir_x;
    dev->sim_y += dev->sim_dir_y;
    
    if (dev->sim_x <= 0 || dev->sim_x >= 16000) dev->sim_dir_x *= -1;
    if (dev->sim_y <= 0 || dev->sim_y >= 16000) dev->sim_dir_y *= -1;
    
    /* 4. Write Touch Point 0 */
    write_touch_point(&dev->frame_buffer[SITRONIX_HEADER_SIZE], 
                      1, dev->sim_x, dev->sim_y, 60, 100);
                      
    /* 5. Generate Matrix Data (Moving Gradient) */
    matrix_ptr = &dev->frame_buffer[SITRONIX_HEADER_SIZE + SITRONIX_TOUCH_DATA_SIZE];
    dev->sequence++;
    
    for (r = 0; r < ROWS; r++) {
        for (c = 0; c < COLS; c++) {
            /* Simple pattern: moving diagonal wave */
            int val = (c * 5 + r * 5 + dev->sequence * 2) % 255;
            if (val > 100) val = 100; /* Clamp to 0-100 as per server expectation usually, but protocol allows 255 */
            *matrix_ptr++ = (uint8_t)val;
        }
    }
    
    dev->data_ready = 1;
    wake_up_interruptible(&dev->read_queue);
    
    mutex_unlock(&dev->mutex);
    
    /* Restart Timer */
    mod_timer(&dev->timer, jiffies + msecs_to_jiffies(UPDATE_INTERVAL_MS));
}

/* Open */
static int dev_open(struct inode *inodep, struct file *filep) {
    filep->private_data = s_dev;
    return 0;
}

/* Read */
static ssize_t dev_read(struct file *filep, char *buffer, size_t len, loff_t *offset) {
    struct sitronix_dev *dev = filep->private_data;
    int ret;
    
    /* We only support reading full frames or nothing */
    if (len < FRAME_SIZE) {
        return -EINVAL;
    }
    
    /* Blocking Read: Wait for new data */
    if (filep->f_flags & O_NONBLOCK) {
        if (!dev->data_ready) return -EAGAIN;
    } else {
        ret = wait_event_interruptible(dev->read_queue, dev->data_ready);
        if (ret != 0) return ret; /* Signal interrupted */
    }
    
    mutex_lock(&dev->mutex);
    
    if (copy_to_user(buffer, dev->frame_buffer, FRAME_SIZE)) {
        mutex_unlock(&dev->mutex);
        return -EFAULT;
    }
    
    dev->data_ready = 0; /* Clear flag until next timer tick */
    
    mutex_unlock(&dev->mutex);
    
    return FRAME_SIZE;
}

/* Close */
static int dev_release(struct inode *inodep, struct file *filep) {
    return 0;
}

/* File Operations */
static struct file_operations fops = {
    .open = dev_open,
    .read = dev_read,
    .release = dev_release,
    .owner = THIS_MODULE,
};

/* Module Init */
static int __init sitronix_init(void) {
    int ret;
    
    s_dev = kmalloc(sizeof(struct sitronix_dev), GFP_KERNEL);
    if (!s_dev) return -ENOMEM;
    
    memset(s_dev, 0, sizeof(struct sitronix_dev));
    
    /* Initialize primitives */
    mutex_init(&s_dev->mutex);
    init_waitqueue_head(&s_dev->read_queue);
    
    /* Simulation Defaults */
    s_dev->sim_x = 1000;
    s_dev->sim_y = 1000;
    s_dev->sim_dir_x = 200;
    s_dev->sim_dir_y = 150;
    
    /* Allocate Major Number dynamically */
    ret = alloc_chrdev_region(&s_dev->dev_num, 0, 1, DRIVER_NAME);
    if (ret < 0) {
        printk(KERN_ALERT "SitronixVirtual: Failed to allocate major number\n");
        goto err_alloc;
    }
    
    /* Create Class */
#if LINUX_VERSION_CODE >= KERNEL_VERSION(6, 4, 0)
    s_dev->class = class_create(CLASS_NAME);
#else
    s_dev->class = class_create(THIS_MODULE, CLASS_NAME);
#endif

    if (IS_ERR(s_dev->class)) {
        printk(KERN_ALERT "SitronixVirtual: Failed to register device class\n");
        ret = PTR_ERR(s_dev->class);
        goto err_class;
    }
    
    /* Create Device */
    s_dev->device = device_create(s_dev->class, NULL, s_dev->dev_num, NULL, DRIVER_NAME);
    if (IS_ERR(s_dev->device)) {
        printk(KERN_ALERT "SitronixVirtual: Failed to create device\n");
        ret = PTR_ERR(s_dev->device);
        goto err_device;
    }
    
    /* Init Cdev */
    cdev_init(&s_dev->cdev, &fops);
    s_dev->cdev.owner = THIS_MODULE;
    ret = cdev_add(&s_dev->cdev, s_dev->dev_num, 1);
    if (ret < 0) {
        printk(KERN_ALERT "SitronixVirtual: Failed to add cdev\n");
        goto err_cdev;
    }
    
    /* Init Timer */
    timer_setup(&s_dev->timer, sitronix_timer_callback, 0);
    mod_timer(&s_dev->timer, jiffies + msecs_to_jiffies(UPDATE_INTERVAL_MS));
    
    printk(KERN_INFO "SitronixVirtual: Initialized. Device: /dev/%s\n", DRIVER_NAME);
    return 0;

err_cdev:
    device_destroy(s_dev->class, s_dev->dev_num);
err_device:
    class_destroy(s_dev->class);
err_class:
    unregister_chrdev_region(s_dev->dev_num, 1);
err_alloc:
    kfree(s_dev);
    return ret;
}

/* Module Exit */
static void __exit sitronix_exit(void) {
    if (s_dev) {
        del_timer_sync(&s_dev->timer);
        cdev_del(&s_dev->cdev);
        device_destroy(s_dev->class, s_dev->dev_num);
        class_destroy(s_dev->class);
        unregister_chrdev_region(s_dev->dev_num, 1);
        kfree(s_dev);
    }
    printk(KERN_INFO "SitronixVirtual: Unloaded\n");
}

module_init(sitronix_init);
module_exit(sitronix_exit);