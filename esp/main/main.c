#include "main.h"
#include "wifi.h"
#include "socket_task.h"
#include "../env.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_wifi.h"
#include "esp_adc/adc_oneshot.h"
#include "spi_flash_mmap.h"
#include <sys/time.h>

#define TAG "main"
#define ADC_UNIT ADC_UNIT_1 // SAR ADC 1
#define ADC_BITWIDTH ADC_BITWIDTH_DEFAULT // use maximum ADC bit width
#define ADC_ATTEN ADC_ATTEN_DB_12 // use 12dB attenuation for full range
#define ADC_CHANNEL ADC_CHANNEL_6 // GPIO34
#define ADC_READ_INTERVAL_MS 1000
#define FLASH_SECTOR_SIZE 65536
#define VOLTAGE_THRESHOLD 1800

EventGroupHandle_t s_wifi_event_group;
TaskHandle_t socket_task_handle;
esp_event_loop_handle_t wifi_connect_event_loop_handle;

int to_ms(struct timeval tv) {
    return tv.tv_sec * 1000 + tv.tv_usec / 1000;
}

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

    // init ADC
    adc_oneshot_unit_handle_t adc1_handle;
    adc_oneshot_unit_init_cfg_t init_config1 = {
        .unit_id = ADC_UNIT,
    };
    ESP_ERROR_CHECK(adc_oneshot_new_unit(&init_config1, &adc1_handle));

    // configure ADC
    adc_oneshot_chan_cfg_t config = {
        .bitwidth = ADC_BITWIDTH,
        .atten = ADC_ATTEN,
    };
    ESP_ERROR_CHECK(adc_oneshot_config_channel(adc1_handle, ADC_CHANNEL, &config));

    // init ADC calibration
    adc_cali_handle_t adc_cali_handle = NULL;
    ESP_LOGI(TAG, "calibration scheme version is %s", "Line Fitting");
    adc_cali_line_fitting_config_t cali_config = {
        .unit_id = ADC_UNIT,
        .atten = ADC_ATTEN,
        .bitwidth = ADC_BITWIDTH,
    };
    ESP_ERROR_CHECK(adc_cali_create_scheme_line_fitting(&cali_config, &adc_cali_handle));
    ESP_LOGI(TAG, "ADC init finished");

    // find the partition map in the partition table
    const esp_partition_t *partition = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, "storage");
    ESP_LOGI(TAG, "partition searched for");
    assert(partition != NULL);
    ESP_LOGI(TAG, "partition found");

    // initialize flash sector
    struct timeval tv, tvold;
    gettimeofday(&tvold, NULL);
    ESP_ERROR_CHECK(esp_partition_erase_range(partition, 0, FLASH_SECTOR_SIZE));
    gettimeofday(&tv, NULL);
    ESP_LOGI(TAG, "Erase flash sector finished in %d", to_ms(tv) - to_ms(tvold));

    // read ADC
    int adc_raw, voltage;
    bool voltage_high = false;
    int flash_addr = partition->address;
    static int buf[SPI_FLASH_SEC_SIZE / sizeof(int)];
    while (1) {
        if (adc_oneshot_read(adc1_handle, ADC_CHANNEL, &adc_raw) == ESP_OK) {
            ESP_LOGI(TAG, "ADC read raw data: %d", adc_raw);
            ESP_ERROR_CHECK(adc_cali_raw_to_voltage(adc_cali_handle, adc_raw, &voltage));
            ESP_LOGI(TAG, "ADC read Cali Voltage: %d mV", voltage);
            if (voltage_high ^ (voltage < VOLTAGE_THRESHOLD)) {
                voltage_high = !voltage_high;
                gettimeofday(&tvold, NULL);
                ESP_LOGI(TAG, "Voltage %s at %d", voltage_high ? "HIGH" : "LOW", to_ms(tvold));
                int time_ms = to_ms(tvold);
                ESP_ERROR_CHECK(esp_partition_write(partition, flash_addr - partition->address, &time_ms, sizeof(time_ms)));
                gettimeofday(&tv, NULL);
                ESP_LOGI(TAG, "Wrote to flash in %d", to_ms(tv) - to_ms(tvold));
                flash_addr += sizeof(time_ms);
            }
            if (flash_addr > partition->address) {
                ESP_ERROR_CHECK(esp_partition_read(partition, 0, buf, flash_addr - partition->address));
                gettimeofday(&tvold, NULL);
                for (int i = 0; i < (flash_addr - partition->address) / sizeof(int); i++) {
                    ESP_LOGI(TAG, "Flash content: %d", buf[i]);
                }
                gettimeofday(&tv, NULL);
                ESP_LOGI(TAG, "Read from flash in %d", to_ms(tv) - to_ms(tvold));
            }
        } else {
            ESP_LOGW(TAG, "ADC read failed");
        }
        vTaskDelay(pdMS_TO_TICKS(ADC_READ_INTERVAL_MS));
    }
}
