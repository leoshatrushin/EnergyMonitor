import fs from 'fs';
import net from 'net';
import { SIZEOF_UINT32, BAR_WIDTH } from './common/constants';
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
            // wait for 128 bytes
            const apiKeyBuf = streamReader.readBytes(128);
            if (!apiKeyBuf) return;

            // compare api key
            if (decoder.decode(apiKeyBuf) == SENSOR_API_KEY) {
                sensorAuthenticated = true;
                if (currentSocket) currentSocket.destroy();
                currentSocket = socket;
                console.log('sensor authenticated');
                data = data.subarray(data.byteLength - streamReader.bytesLeft);
            } else {
                socket.destroy();
                console.log('sensor authentication failed');
                return;
            }
        }

        // append to timestamp file
        const timestampBuf = streamReader.readBytes(roundDown(streamReader.bytesLeft, SIZEOF_UINT32));
        const timestampFileState = state[BAR_WIDTH.LINE];
        fs.appendFileSync(timestampFileState.fd, timestampBuf);

        // create timestamp array
        const timestamps = new Uint32Array(timestampBuf.buffer);
        const lastTimestamp = timestamps[timestamps.length - 1];

        // set first key if file empty
        if (timestampFileState.lastKey == 0) timestampFileState.firstKey = lastTimestamp;

        // append to each index file
        for (const barWidth in state) {
            if (barWidth == String(BAR_WIDTH.LINE)) continue;
            const fileState: FILE_STATE = state[barWidth];

            // set keys if file empty
            if (fileState.lastKey == 0) {
                fileState.firstKey = roundDown(lastTimestamp, Number(barWidth));
                fileState.lastKey = roundDown(lastTimestamp, Number(barWidth));
            }

            // allocate buffer for new bar offsets
            const totalNewBars = roundDown(lastTimestamp - fileState.lastKey, Number(barWidth)) / Number(barWidth);
            const newOffsets = new Uint32Array(totalNewBars);
            let barsWritten = 0;

            // fill buffer with new offsets
            for (let i = 0; i < timestamps.length; i += 1) {
                const newBars = roundDown(timestamps[i] - fileState.lastKey, Number(barWidth)) / Number(barWidth);
                newOffsets.fill(timestampFileState.size + i * SIZEOF_UINT32, barsWritten, barsWritten + newBars);
                barsWritten += newBars;

                // update state
                fileState.size += newBars * SIZEOF_UINT32;
                fileState.lastKey += totalNewBars * Number(barWidth);
                fileState.lastOffset = timestampFileState.size + i * SIZEOF_UINT32;
            }

            // append new offsets to file
            fs.appendFileSync(fileState.fd, new Uint8Array(newOffsets.buffer));
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
