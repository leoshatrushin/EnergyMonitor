import fs from 'fs';
import net from 'net';
import { SIZEOF_TIMESTAMP, BAR_WIDTH, SIZEOF_INDEX } from './common/constants';
import { FILE_STATE } from './constants';
import { StreamReader, roundDown } from './common/utils';
import state from './state';
import wss from './wss';

const SENSOR_PORT = process.env.SENSOR_PORT;
const SENSOR_API_KEY = process.env.SENSOR_API_KEY;
const decoder = new TextDecoder();

let currentSocket = null;
const tcpServer = net.createServer(socket => {
    let sensorAuthenticated = false;
    let streamReader = new StreamReader();

    socket.on('data', async data => {
        // concatenate data to buffer
        streamReader.readInto(data);

        // handle authentication
        if (!sensorAuthenticated) {
            // wait for api key
            const apiKeyBuf = streamReader.readBytes(SENSOR_API_KEY.length);
            if (!apiKeyBuf) return;

            // compare api key
            if (decoder.decode(apiKeyBuf) == SENSOR_API_KEY) {
                sensorAuthenticated = true;
                if (currentSocket) currentSocket.destroy();
                currentSocket = socket;
                console.log('sensor authenticated');
            } else {
                socket.destroy();
                console.log('sensor authentication failed');
                return;
            }
        }

        // append to timestamp file
        const timestampBuf = streamReader.readBytes(roundDown(streamReader.bytesLeft, SIZEOF_TIMESTAMP));
        const timestampFileState = state[BAR_WIDTH.LINE];
        fs.appendFileSync(timestampFileState.fd, timestampBuf);

        // create timestamp array
        const timestamps = new BigUint64Array(timestampBuf.buffer, timestampBuf.byteOffset);
        const firstTimestamp = Number(timestamps[0]);
        const lastTimestamp = Number(timestamps[timestamps.length - 1]);

        // set first key if file empty
        if (timestampFileState.lastKey == 0) timestampFileState.firstKey = lastTimestamp;

        // append to each index file
        for (const barWidthStr in state) {
            const barWidth = Number(barWidthStr);
            if (barWidth == BAR_WIDTH.LINE) continue;
            const indexState: FILE_STATE = state[barWidth];

            // initialize file and state if empty
            if (indexState.lastKey == 0) {
                indexState.firstKey = roundDown(firstTimestamp, barWidth);
                indexState.lastKey = roundDown(firstTimestamp, barWidth);
                const firstIndex = Buffer.alloc(SIZEOF_INDEX);
                firstIndex.writeUInt32LE(0);
                fs.appendFileSync(indexState.fd, firstIndex);
            }

            // allocate buffer for new bar offsets
            const totalNewBars = roundDown(lastTimestamp - indexState.lastKey, barWidth) / barWidth;
            const newIndexes = new Uint32Array(totalNewBars);
            let barsWritten = 0;

            // fill buffer with new offsets
            for (let i = 0; i < timestamps.length; i++) {
                const newBars = roundDown(Number(timestamps[i]) - indexState.lastKey, barWidth) / barWidth;
                newIndexes.fill(timestampFileState.size + i * SIZEOF_TIMESTAMP, barsWritten, barsWritten + newBars);
                barsWritten += newBars;

                // update state
                indexState.size += newBars * SIZEOF_INDEX;
                indexState.lastKey += newBars * barWidth;
                if (newBars) indexState.lastOffset = timestampFileState.size + i * SIZEOF_TIMESTAMP;
            }

            // append new offsets to file
            fs.appendFileSync(indexState.fd, new Uint8Array(newIndexes.buffer));
        }

        // update state
        timestampFileState.size += timestampBuf.byteLength;
        timestampFileState.lastKey = lastTimestamp;

        // send new timestamps to clients
        wss.emit('timestamps', timestampBuf);

        // leave only unprocessed bytes in buffer
        streamReader.eraseProcessedBytes();
    });

    socket.on('error', err => {
        console.log('sensor error', err);
    });

    socket.on('close', hadError => {
        console.log(`sensor close${hadError ? ' with error' : ''}}`);
    });
});

tcpServer.listen(SENSOR_PORT);
