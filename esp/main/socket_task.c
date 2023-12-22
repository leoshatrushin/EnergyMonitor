#include "socket_task.h"
#include "main.h"
#include "wifi.h"
#include "utils.h"
#include "../env.h"
#include "esp_log.h"
#include "netdb.h"
#include "esp_tls.h"
#include "esp_partition.h"

#define TAG "socket_task"
/* extern const uint8_t server_root_cert_pem_start[] asm("_binary_server_root_cert_pem_start"); */
/* extern const uint8_t server_root_cert_pem_end[]   asm("_binary_server_root_cert_pem_end"); */

static int socket_partition_offset = 0;
static int *socket_map_ptr = (int *) buffer_1;
struct metadata_t {
    int magic;
    int lastValue;
};
struct metadata_t metadata = {0, 0};

/* int Esp_tls_conn_write(esp_tls_t *tls, const void *data, int len) { */
/*     int written_bytes = 0; */
/*     while (written_bytes < len) { */
/*         int bytes_written = esp_tls_conn_write(tls, data + written_bytes, len - written_bytes); */
/*         if (bytes_written < 0 && bytes_written != ESP_TLS_ERR_SSL_WANT_READ && bytes_written != ESP_TLS_ERR_SSL_WANT_WRITE) { */
/*             ESP_LOGW(TAG, "esp_tls_conn_write failed: errno %d", errno); */
/*             return -1; */
/*         } */
/*         written_bytes += bytes_written; */
/*     } */
/*     return written_bytes; */
/* } */

/* void socket_task(void *param) { */
/*     esp_tls_t *tls = esp_tls_init(); */
/*     NULL_CHECK(tls); */
/*     esp_tls_cfg_t tls_cfg = { */
/*         .cacert_buf = (const unsigned char *) server_root_cert_pem_start, */
/*         .cacert_bytes = server_root_cert_pem_end - server_root_cert_pem_start, */
/*         .tls_version = ESP_TLS_VER_TLS_1_3, */
/*     }; */
/*     while(1) { */
/*         xEventGroupWaitBits(s_wifi_event_group, WIFI_CONNECTED_BIT, pdFALSE, pdFALSE, portMAX_DELAY); */
/*         esp_tls_conn_new_sync(SERVER_HOSTNAME, strlen(SERVER_HOSTNAME), SERVER_PORT, &tls_cfg, tls); */
/*         while (1) { */
/*             /1* int left_in_sector = MIN(partition_offset - socket_partition_offset, SECTOR_LEFT(socket_partition_offset)); *1/ */
/*             /1* char server_offset_ack; *1/ */
/*             /1* if (Esp_tls_conn_write(tls, (const void *) &metadata, sizeof(metadata)) < 0) break; *1/ */
/*             /1* if (Esp_tls_conn_write(tls, socket_map_ptr, left_in_sector) < 0) break; *1/ */
/*             /1* if (esp_tls_conn_read(tls, &server_offset_ack, sizeof(char)) <= 0) break; *1/ */
/*             /1* metadata.lastValue = socket_map_ptr[socket_partition_offset + left_in_sector - 1]; *1/ */
/*             /1* socket_partition_offset += left_in_sector; *1/ */
/*         } */
/*     } */
/* } */
