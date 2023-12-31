#include "main.h"
#include "wifi.h"
#include "socket_task.h"
#include "utils.h"
#include "../env.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_wifi.h"
#include "esp_adc/adc_oneshot.h"
#include "spi_flash_mmap.h"
#include "string.h"
#include <sys/time.h>
#include "netdb.h"
#include "esp_tls.h"
#include "esp_netif_sntp.h"

extern const uint8_t server_root_cert_pem_start[] asm(CERT_START);
extern const uint8_t server_root_cert_pem_end[]   asm(CERT_END);

#define TAG "main"
#define ADC_UNIT ADC_UNIT_1 // SAR ADC 1
#define ADC_BITWIDTH ADC_BITWIDTH_DEFAULT // use maximum ADC bit width
#define ADC_ATTEN ADC_ATTEN_DB_12 // use 12dB attenuation for full range
#define ADC_CHANNEL ADC_CHANNEL_6 // GPIO34
#define ADC_READ_INTERVAL_MS 1000
#define VOLTAGE_THRESHOLD 1800

EventGroupHandle_t s_wifi_event_group;
TaskHandle_t socket_task_handle;
esp_event_loop_handle_t wifi_connect_event_loop_handle;

const int buffer_1[FLASH_SECTOR_SIZE / sizeof(int)];
const int buffer_2[FLASH_SECTOR_SIZE / sizeof(int)];
const int buffer_3[FLASH_SECTOR_SIZE / sizeof(int)];
volatile int partition_offset = 0;

int Esp_tls_conn_write(esp_tls_t *tls, const void *data, int len) {
    int written_bytes = 0;
    while (written_bytes < len) {
        int bytes_written = esp_tls_conn_write(tls, data + written_bytes, len - written_bytes);
        if (bytes_written < 0 && bytes_written != ESP_TLS_ERR_SSL_WANT_READ && bytes_written != ESP_TLS_ERR_SSL_WANT_WRITE) {
            ESP_LOGW(TAG, "esp_tls_conn_write failed: errno %d", errno);
            return -1;
        }
        written_bytes += bytes_written;
    }
    return written_bytes;
}

uint64_t to_ms(struct timeval tv) {
    return tv.tv_sec * 1000 + tv.tv_usec / 1000;
}

int *swap_map_ptr(int *map_ptr) {
    if (map_ptr == buffer_1) {
        return (int *) buffer_2;
    } else {
        return (int *) buffer_1;
    }
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

    // find the partition map in the partition table
    const esp_partition_t *partition = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, "storage");
    assert(partition != NULL);

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

    // initialize flash sectors
    /* ESP_ERROR_CHECK(esp_partition_erase_range(partition, 0, FLASH_SECTOR_SIZE * 2)); */
    esp_partition_mmap_handle_t map_handle_1, map_handle_2;
    int *curr_map_ptr = (int *) buffer_1;
    /* ESP_ERROR_CHECK(esp_partition_mmap(partition, 0, FLASH_SECTOR_SIZE, ESP_PARTITION_MMAP_DATA, (const void **) buffer_1, &map_handle_1)); */
    /* ESP_ERROR_CHECK(esp_partition_mmap(partition, FLASH_SECTOR_SIZE, FLASH_SECTOR_SIZE, ESP_PARTITION_MMAP_DATA, (const void **) buffer_2, &map_handle_2)); */

    // create socket task
    /* xTaskCreate(socket_task, "socket_task", 4096, NULL, 0, &socket_task_handle); */
    
    // perform SNTP synchronization
    ESP_LOGI(TAG, "Initializing SNTP");
    esp_sntp_config_t sntp_config = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
    esp_netif_sntp_init(&sntp_config);

    // wait for SNTP synchronization
    if (esp_netif_sntp_sync_wait(pdMS_TO_TICKS(10000)) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to update system time within 10s timeout");
    }
    ESP_LOGI(TAG, "SNTP sync finished");

    // read ADC
    int adc_raw, voltage;
    bool voltage_high = false;
    struct timeval tv, read_start;
    uint64_t time_ms;
    xEventGroupWaitBits(s_wifi_event_group, WIFI_CONNECTED_BIT, pdFALSE, pdFALSE, portMAX_DELAY);
    esp_tls_t *tls = esp_tls_init();
    NULL_CHECK(tls);
    esp_tls_cfg_t tls_cfg = {
        .cacert_buf = (const unsigned char *) server_root_cert_pem_start,
        .cacert_bytes = server_root_cert_pem_end - server_root_cert_pem_start,
        .skip_common_name = CFG_SKIP_COMMON_NAME,
        /* .tls_version = ESP_TLS_VER_TLS_1_3, */
    };
    ESP_LOGI(TAG, "Connecting to %s:%d", SERVER_HOSTNAME, SERVER_PORT);
    esp_tls_conn_new_sync(SERVER_HOSTNAME, strlen(SERVER_HOSTNAME), SERVER_PORT, &tls_cfg, tls);
    ESP_LOGI(TAG, "Connected to %s:%d", SERVER_HOSTNAME, SERVER_PORT);
    Esp_tls_conn_write(tls, API_KEY, strlen(API_KEY));
    ESP_LOGI(TAG, "Sent API key");
    while (1) {
        gettimeofday(&read_start, NULL);
        if (adc_oneshot_read(adc1_handle, ADC_CHANNEL, &adc_raw) == ESP_OK) {
            ESP_LOGD(TAG, "ADC read raw data: %d", adc_raw);
            ESP_ERROR_CHECK(adc_cali_raw_to_voltage(adc_cali_handle, adc_raw, &voltage));
            ESP_LOGD(TAG, "ADC read Cali Voltage: %d mV", voltage);
            if (voltage_high ^ (voltage < VOLTAGE_THRESHOLD)) {
                voltage_high = !voltage_high;
                gettimeofday(&tv, NULL);
                time_ms = to_ms(tv);
                ESP_LOGI(TAG, "tv_sec: %lld, tv_usec: %ld", tv.tv_sec, tv.tv_usec);
                ESP_LOGI(TAG, "Voltage %s at %llu", voltage_high ? "HIGH" : "LOW", time_ms);
                /* memcpy(curr_map_ptr, &time_ms, sizeof(time_ms)); */
                /* partition_offset += sizeof(time_ms); */
                /* if (partition_offset % FLASH_SECTOR_SIZE == 0) curr_map_ptr = swap_map_ptr(curr_map_ptr); */
                /* if (partition_offset == partition->size) partition_offset = 0; */
                Esp_tls_conn_write(tls, &time_ms, sizeof(time_ms));
            }
        } else {
            ESP_LOGW(TAG, "ADC read failed");
        }
        gettimeofday(&tv, NULL);
        int dt = to_ms(tv) - to_ms(read_start);
        if (dt > ADC_READ_INTERVAL_MS) {
            ESP_LOGW(TAG, "ADC read took too long: %d ms", dt);
        } else {
            ESP_LOGD(TAG, "ADC read took %d ms", dt);
            vTaskDelay(pdMS_TO_TICKS(ADC_READ_INTERVAL_MS - dt));
        }
    }
}
