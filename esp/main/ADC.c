#include "esp_event.h"

#define WIFI_CONNECTED_BIT BIT0
#define WIFI_DISCONNECTED_BIT BIT1

extern EventGroupHandle_t s_wifi_event_group;

extern void initialize_wifi(void);

