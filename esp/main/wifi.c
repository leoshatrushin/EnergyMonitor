#include "wifi.h"
#include "main.h"
#include "esp_wifi.h"
#include "esp_log.h"
#include "esp_event.h"

#define TAG "wifi"
#define WIFI_RECONNECT_DELAY_MS 1000

ESP_EVENT_DEFINE_BASE(WIFI_CONNECT_EVENT);

void wifi_start_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data) {
    ESP_ERROR_CHECK(esp_wifi_connect());
}

void got_ip_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data) {
    xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    ESP_LOGI(TAG, "got ip:" IPSTR, IP2STR(&((ip_event_got_ip_t*) event_data)->ip_info.ip));
    // close sockets
    // create sockets
}

void wifi_disconnect_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data) {
    xEventGroupSetBits(s_wifi_event_group, WIFI_DISCONNECTED_BIT);
    xEventGroupClearBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    ESP_LOGI(TAG, "wifi disconnected with reason: %d", ((wifi_event_sta_disconnected_t*)event_data)->reason);
    esp_event_post_to(wifi_connect_event_loop_handle, WIFI_CONNECT_EVENT, WIFI_CONNECT_ATTEMPT, NULL, 0, portMAX_DELAY);
    // close sockets
    // create sockets
}

void wifi_connect_attempt_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data) {
    ESP_LOGI(TAG, "attempting to reconnect");
    ESP_ERROR_CHECK(esp_wifi_connect());
    vTaskDelay(pdMS_TO_TICKS(WIFI_RECONNECT_DELAY_MS));
}
