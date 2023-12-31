import fs from 'fs';
import net from 'net';
import { TIMESTAMP_SIZE, FILE_OFFSET_SIZE, MINUTE } from './common/constants';
import { StreamReader, roundDown } from './common/utils';
import state from './state';
import wss from './wss';

const SENSOR_PORT = process.env.SENSOR_PORT;
const SENSOR_API_KEY = process.env.SENSOR_API_KEY;

const timestampWriteStream = fs.createWriteStream('./data/timestamps.bin', { flags: 'a' });
const minutesWriteStream = fs.createWriteStream('./data/minutes.bin', { flags: 'a' });

let sensorAuthenticated = false;
const tcpServer = net.createServer(socket => {
    // ignore connections if sensor is already connected
    if (sensorAuthenticated) {
        socket.destroy();
        return;
    }

    let streamReader = new StreamReader();
    socket.on('data', async data => {
        // concatenate data to buffer
        streamReader.readInto(data);

        // handle authentication
        if (!sensorAuthenticated) {
            // wait for 128 bytes
            const apiKeyBuf = streamReader.readBytes(128);
            if (!apiKeyBuf) return;

            // compare api key
            if (String.fromCharCode(...apiKeyBuf) == SENSOR_API_KEY) {
                sensorAuthenticated = true;
                console.log('sensor authenticated');
                data = data.subarray(data.length - streamReader.bytesLeft);
            } else {
                socket.destroy();
                console.log('sensor authentication failed');
                return;
            }
        }

        // write to timestamp file directly
        timestampWriteStream.write(data);

        // write to minutes file
        // process every complete timestamp received
        const bytesLeft = streamReader.bytesLeft;
        const timestampBuf = streamReader.readBytes(roundDown(bytesLeft, TIMESTAMP_SIZE));
        const view = new DataView(timestampBuf.buffer);
        for (let offset = 0; offset < timestampBuf.length; offset += TIMESTAMP_SIZE) {
            const timestamp = Number(view.getBigUint64(offset, true));
            console.log(timestamp);

            const minutesDiff = roundDown(timestamp - state.lastMinute, MINUTE) / MINUTE;
            // save offset for each new minute
            const offsetBuf = Buffer.alloc(FILE_OFFSET_SIZE * minutesDiff);
            for (let minuteDiff = 0; minuteDiff < minutesDiff; minuteDiff++) {
                offsetBuf.writeUInt32LE(state.timestampFileOffset, minuteDiff * FILE_OFFSET_SIZE);
            }
            minutesWriteStream.write(offsetBuf);

            // update state
            state.lastMinute += MINUTE * minutesDiff;
            state.timestampFileOffset += TIMESTAMP_SIZE;
        }

        // send new timestamps to clients
        wss.emit('timestamps', timestampBuf);

        // leave only unprocessed bytes in buffer
        streamReader.eraseProcessedBytes();
    });

    socket.on('close', () => {
        console.log('sensor disconnected');
        sensorAuthenticated = false;
    });
});

tcpServer.listen(SENSOR_PORT);
