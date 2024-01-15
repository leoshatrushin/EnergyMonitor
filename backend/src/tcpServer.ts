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
        const timestampBuf = streamReader.readBytes(roundDown(streamReader.bytesLeft, SIZEOF_UINT32));
        const timestampFileState = state[BAR_WIDTH.LINE];
        fs.appendFileSync(timestampFileState.fd, timestampBuf);

        // create timestamp array
        const timestamps = new Uint32Array(
            timestampBuf.buffer,
            timestampBuf.byteOffset,
            timestampBuf.byteLength / SIZEOF_UINT32,
        );
        const lastTimestamp = timestamps[timestamps.length - 1];

        // set first key if file empty
        if (timestampFileState.lastKey == 0) timestampFileState.firstKey = lastTimestamp;

        // append to each index file
        for (const barWidth in state) {
            if (barWidth == String(BAR_WIDTH.LINE)) continue;
            const fileState: FILE_STATE = state[barWidth];

            // initialize file and state if empty
            if (fileState.lastKey == 0) {
                fileState.firstKey = roundDown(timestamps[0], Number(barWidth));
                fileState.lastKey = roundDown(timestamps[0], Number(barWidth));
                const firstOffset = Buffer.alloc(4);
                firstOffset.writeUInt32LE(0);
                fs.appendFileSync(fileState.fd, firstOffset);
            }

            // allocate buffer for new bar offsets
            const totalNewBars = roundDown(lastTimestamp - fileState.lastKey, Number(barWidth)) / Number(barWidth);
            const newOffsets = new Uint32Array(totalNewBars);
            let barsWritten = 0;

            // fill buffer with new offsets
            for (let i = 0; i < timestamps.length; i++) {
                const newBars = roundDown(timestamps[i] - fileState.lastKey, Number(barWidth)) / Number(barWidth);
                newOffsets.fill(timestampFileState.size + i * SIZEOF_UINT32, barsWritten, barsWritten + newBars);
                barsWritten += newBars;

                // update state
                fileState.size += newBars * SIZEOF_UINT32;
                fileState.lastKey += newBars * Number(barWidth);
                if (newBars) fileState.lastOffset = timestampFileState.size + i * SIZEOF_UINT32;
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
