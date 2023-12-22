#include "freertos/FreeRTOS.h"
#include "esp_event_base.h"

#define FLASH_SECTOR_SIZE 65536
#define SECTOR_LEFT(x) (FLASH_SECTOR_SIZE - ((x) % FLASH_SECTOR_SIZE)) / sizeof(int)

extern EventGroupHandle_t s_wifi_event_group;
extern TaskHandle_t socket_task_handle;
extern esp_event_loop_handle_t wifi_connect_event_loop_handle;

extern const int buffer_1[FLASH_SECTOR_SIZE / sizeof(int)];
extern const int buffer_2[FLASH_SECTOR_SIZE / sizeof(int)];
extern volatile int partition_offset;
