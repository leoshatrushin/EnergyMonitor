#define ERROR_CHECK(x) do { \
    if ((x) < 0) { \
        ESP_ERROR_CHECK(ESP_FAIL); \
    } \
} while(0)

#define NULL_CHECK(x) do { \
    if ((x) == NULL) { \
        ESP_ERROR_CHECK(ESP_FAIL); \
    } \
} while(0)
