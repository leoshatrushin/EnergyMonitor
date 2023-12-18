#include "esp_event.h"

#define WIFI_CONNECTED_BIT BIT0
#define WIFI_DISCONNECTED_BIT BIT1

#define WIFI_CONNECT_RETRY_INTERVAL_MS 1000
ESP_EVENT_DECLARE_BASE(WIFI_CONNECT_EVENT);
enum wifi_connect_task_event_id {
    WIFI_CONNECT_ATTEMPT,
};

extern void wifi_start_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
extern void got_ip_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
extern void wifi_disconnect_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
extern void wifi_connect_attempt_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
