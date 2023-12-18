#include "main.h"
#include "wifi.h"
#include "socket_task.h"
#include "../env.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_wifi.h"

#define TAG "main"

EventGroupHandle_t s_wifi_event_group;
TaskHandle_t socket_task_handle;
esp_event_loop_handle_t wifi_connect_event_loop_handle;

void app_main(void) {
    // initialize NVS
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    }
    ESP_LOGI(TAG, "nvs init finished");

    // initialize indicator for wifi events
    s_wifi_event_group = xEventGroupCreate();
    if (s_wifi_event_group == NULL) {
        ESP_LOGE(TAG, "Failed to create wifi event group; out of memory");
        return;
    }

    // initialize wifi
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    // configure wifi
    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASS,
            .threshold.authmode = WIFI_MIN_AUTHMODE,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    
    // create wifi connect event loop
    xEventGroupSetBits(s_wifi_event_group, WIFI_DISCONNECTED_BIT);
    esp_event_loop_args_t wifi_connect_event_loop_cfg = {
        .queue_size = 1,
        .task_name = "wifi_connect_task",
        .task_priority = 0,
        .task_stack_size = 4096,
        .task_core_id = tskNO_AFFINITY,
    };
    ESP_ERROR_CHECK(esp_event_loop_create(&wifi_connect_event_loop_cfg, &wifi_connect_event_loop_handle));
    ESP_ERROR_CHECK(esp_event_handler_register_with(wifi_connect_event_loop_handle, WIFI_CONNECT_EVENT,
                                                    WIFI_CONNECT_ATTEMPT, &wifi_connect_attempt_handler, NULL));

    // add event handlers and start wifi
    esp_event_handler_instance_t wifi_start_handler_instance;
    esp_event_handler_instance_t got_ip_handler_instance;
    esp_event_handler_instance_t disconnect_handler_instance;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, WIFI_EVENT_STA_START,
                                                        &wifi_start_handler, NULL, &wifi_start_handler_instance));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                                        &got_ip_handler, NULL, &got_ip_handler_instance));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, WIFI_EVENT_STA_DISCONNECTED,
                                                        &wifi_disconnect_handler, NULL, &disconnect_handler_instance));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_LOGI(TAG, "wifi init finished");

    // create socket task
    xTaskCreate(socket_task, "socket_task", 4096, NULL, 0, &socket_task_handle);
}
