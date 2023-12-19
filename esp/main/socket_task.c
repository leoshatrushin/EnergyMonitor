#include "socket_task.h"
#include "main.h"
#include "wifi.h"
#include "utils.h"
#include "../env.h"
#include "esp_log.h"
#include "netdb.h"
#include "esp_tls.h"

#define TAG "socket_task"
extern const uint8_t server_root_cert_pem_start[] asm("_binary_server_root_cert_pem_start");
extern const uint8_t server_root_cert_pem_end[]   asm("_binary_server_root_cert_pem_end");

int open_addrinfo_clientfd(struct addrinfo *p) {
    // create a socket descriptor
    int clientfd;
    if ((clientfd = socket(p->ai_family, p->ai_socktype, p->ai_protocol)) < 0) {
        ESP_LOGW(TAG, "socket failed: %s", strerror(errno));
        return -1;
    }

    // connect to the server
    if (connect(clientfd, p->ai_addr, p->ai_addrlen) < 0) {
        ESP_LOGW(TAG, "connect failed: %s", strerror(errno));
        ERROR_CHECK(close(clientfd));
        return -1;
    }
    return clientfd;
}

static struct addrinfo cached_addrinfo;
int open_hostname_clientfd() {
    // get a list of potential server addresses
    struct addrinfo hints = {
        .ai_socktype = SOCK_STREAM, /* streaming socket */
        .ai_flags = AI_NUMERICSERV | AI_ADDRCONFIG, /* use numeric port arg, IPvX only if configured */
        .ai_protocol = IPPROTO_TCP, /* TCP */
    };
    struct addrinfo *listp, *p;
    if (getaddrinfo(SERVER_HOSTNAME, SERVER_PORT, &hints, &listp) < 0) {
        ESP_LOGE(TAG, "getaddrinfo failed: %s", strerror(errno));
        return -1;
    }

    // walk the list for one that we can successfully connect to
    int clientfd;
    for (p = listp; p; p = p->ai_next) {
        clientfd = open_addrinfo_clientfd(p);
        if (clientfd >= 0) break;
    }

    // clean up
    freeaddrinfo(listp);
    if (!p) { // all connects failed
        ESP_LOGE(TAG, "could not connect to host");
        return -1;
    } else { // cache the addrinfo for reconnections
        memcpy(&cached_addrinfo, p, sizeof(struct addrinfo));
        ESP_LOGI(TAG, "connected to host");
    }
    return clientfd;
}

static const char *payload = "Message from ESP32 ";

void socket_task(void *param) {
    while(1) {
        xEventGroupWaitBits(s_wifi_event_group, WIFI_CONNECTED_BIT, pdFALSE, pdFALSE, portMAX_DELAY);
        char rx_buffer[128];
        int clientfd = open_hostname_clientfd();
        esp_tls_cfg_t cfg = {
            .cacert_buf = (const unsigned char *) server_root_cert_pem_start,
            .cacert_bytes = server_root_cert_pem_end - server_root_cert_pem_start,
            .tls_version = ESP_TLS_VER_TLS_1_3,
        };
        while (1) {
            int err = send(clientfd, payload, strlen(payload), 0);
            if (err < 0) {
                ESP_LOGE(TAG, "Error occurred during sending: errno %d", errno);
                break;
            }

            int len = recv(clientfd, rx_buffer, sizeof(rx_buffer) - 1, 0);
            // error occurred during receiving
            if (len < 0) {
                ESP_LOGE(TAG, "recv failed: errno %d", errno);
                break;
            }
            // aata received
            else {
                rx_buffer[len] = 0; // null-terminate whatever we received and treat like a string
                ESP_LOGI(TAG, "Received %d bytes from host:", len);
                ESP_LOGI(TAG, "%s", rx_buffer);
            }
        }
    }
}
