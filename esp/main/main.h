#include "freertos/FreeRTOS.h"
#include "esp_event_base.h"

extern EventGroupHandle_t s_wifi_event_group;
extern TaskHandle_t socket_task_handle;
extern esp_event_loop_handle_t wifi_connect_event_loop_handle;
