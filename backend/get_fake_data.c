#include <fcntl.h>
#include <sys/time.h>
#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <stdint.h>

/* #define START 1672531200000 // 1 Jan 2023 00:00:00 */
/* #define START 1701302400000 // 1 Dec 2023 00:00:00 */
/* #define START 1703289600000 // 23 Dec 2023 00:00:00 */
#define START 1703980800000 // 1 Jan 2024 00:00:00

#define ERROR_CHECK(res, msg) \
    if (res < 0) { \
        perror(msg); \
        exit(1); \
    }

int main() {
    int timestampFd = open("./data/timestamps.bin", O_CREAT | O_TRUNC | O_WRONLY, 0644);
    ERROR_CHECK(timestampFd, "open");

    int minuteFd = open("./data/minutes.bin", O_CREAT | O_TRUNC | O_WRONLY, 0644);
    ERROR_CHECK(minuteFd, "open");

    struct timeval tv;
    int res = gettimeofday(&tv, NULL);
    ERROR_CHECK(res, "gettimeofday");

    uint64_t now = tv.tv_sec * 1000 + tv.tv_usec / 1000;
    uint64_t current = START;
    uint64_t prevMinute = 0;
    uint32_t timestampFileOffset = 0;
    while (current < now) {
        res = write(timestampFd, &current, sizeof(current));
        if (res != sizeof(current)) {
            perror("write");
            exit(1);
        }
        if (current - prevMinute >= 60000) {
            res = write(minuteFd, &timestampFileOffset, sizeof(timestampFileOffset));
            if (res != sizeof(timestampFileOffset)) {
                perror("write");
                exit(1);
            }
            prevMinute = current - (current % 60000);
        }
        int min = 333;
        int max = 3000;
        uint64_t dt = min + (rand() % (max - min + 1));
        current += dt;
        timestampFileOffset += sizeof(current);
    }
    if (res != sizeof(current)) {
        perror("write");
        exit(1);
    }
    res = close(timestampFd);
    ERROR_CHECK(res, "close");
    res = close(minuteFd);
    ERROR_CHECK(res, "close");
}
