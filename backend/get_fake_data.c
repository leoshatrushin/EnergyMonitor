#include <fcntl.h>
#include <sys/time.h>
#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <stdint.h>

/* #define START 1672531200000 // 1 Jan 2023 00:00:00 */
/* #define START 1701302400000 // 1 Dec 2023 00:00:00 */
#define START 1703289600000 // 23 Dec 2023 00:00:00

int main() {
    int timestampFd = open("./timestamps.bin", O_CREAT | O_TRUNC | O_WRONLY, 0644);
    if (timestampFd < 0) {
        perror("open");
        exit(1);
    }
    int minuteFd = open("./minutes.bin", O_CREAT | O_TRUNC | O_WRONLY, 0644);
    if (minuteFd < 0) {
        perror("open");
        exit(1);
    }
    struct timeval tv;
    gettimeofday(&tv, NULL);
    uint64_t now = tv.tv_sec * 1000 + tv.tv_usec / 1000;
    uint64_t current = START;
    uint64_t prevMinute = 0;
    uint32_t timestampFileOffset = 0;
    int res;
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
    if (res < 0) {
        perror("close");
        exit(1);
    }
    res = close(minuteFd);
    if (res < 0) {
        perror("close");
        exit(1);
    }
}
