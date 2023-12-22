#include <fcntl.h>
#include <sys/time.h>
#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>

#define START 1672531200

int main() {
    int fd = open("./minutes.bin", O_CREAT | O_WRONLY, 0644);
    if (fd < 0) {
        perror("open");
        exit(1);
    }
    struct timeval tv;
    gettimeofday(&tv, NULL);
    int now = tv.tv_sec;
    int current = START;
    int total = 0;
    while (current < now) {
        int res = write(fd, &total, sizeof(int));
        if (res < 0) {
            perror("write");
            exit(1);
        }
        int random_number = 20 + (rand() % (180 - 20 + 1));
        total += random_number;
        current += 60;
    }
    int res = close(fd);
    if (res < 0) {
        perror("close");
        exit(1);
    }
}
