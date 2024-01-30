import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import {
    REQUEST_TYPE,
    REQUEST,
    RESPONSE,
    SIZEOF_UINT32,
    BAR_WIDTH,
    RESPONSE_TYPE,
    SIZEOF_TIMESTAMP,
    SIZEOF_INDEX,
} from './common/constants';
import state from './state';
import { readUInt32LE } from './utils';

const wss = new WebSocketServer({ noServer: true });
const clients = new Set<WS_State>();

const MAX_REQUEST_SIZE = 1000;

// stream timestamps
wss.on('timestamp', (timestampbuf: Buffer) => {
    for (const ws_state of clients) {
        // skip if not streaming
        if (ws_state.streamingId == 0) continue;

        // form response
        const buffer = Buffer.alloc(4 * SIZEOF_UINT32 + timestampbuf.byteLength);
        buffer.writeUInt32LE(0, ws_state.streamingId);
        buffer.writeUInt32LE(Number(timestampbuf.readBigUInt64LE(0)), SIZEOF_UINT32);
        buffer.writeUInt32LE(
            Number(timestampbuf.readBigUInt64LE(timestampbuf.byteLength - SIZEOF_TIMESTAMP)),
            SIZEOF_UINT32 * 2,
        );
        buffer.writeUInt32LE(timestampbuf.byteLength, SIZEOF_UINT32 * 3);
        buffer.set(timestampbuf, SIZEOF_UINT32 * 4);

        // send response
        ws_state.ws.send(buffer);
    }
});

function validateRequest(request: REQUEST) {
    // check validity
    if (!Object.values(REQUEST_TYPE).includes(request.type)) return `Invalid request type ${request.type}`;
    if (!Object.values(BAR_WIDTH).includes(request.barWidth)) return `Invalid bar width ${request.barWidth}`;
    if (request.start > request.end)
        return `Invalid request bounds start ${request.start} greater than end ${request.end}`;
    let barWidth = request.barWidth;
    if (request.barWidth == BAR_WIDTH.LINE) barWidth = Number(Object.keys(BAR_WIDTH)[1]);
    if (request.type != REQUEST_TYPE.LIVE) {
        if (request.start % request.barWidth || request.end % request.barWidth)
            return `Non-aligned request bounds start ${request.start}, end ${request.end}, barWidth ${request.barWidth}`;
    }

    // check size
    const requestSize = (request.end - request.start) / barWidth;
    if (requestSize > MAX_REQUEST_SIZE) return `Request size ${requestSize} too large`;

    return '';
}

// get offset in bar index file for bar corresponding to timestamp
function getOffset(timestamp: number, barWidth: BAR_WIDTH) {
    const fileState = state[barWidth];
    return ((timestamp - fileState.firstKey) / barWidth) * SIZEOF_INDEX;
}

function getTimestamp(offset: number, barWidth: BAR_WIDTH) {
    const fileState = state[barWidth];
    return fileState.firstKey + (offset / SIZEOF_INDEX) * barWidth;
}

function clamp(min: number, value: number, max: number) {
    return Math.min(Math.max(min, value), max);
}

function getBounds(request: REQUEST): {
    start: number;
    end: number;
    fileStart: number;
    fileEnd: number;
} {
    const fileState = state[request.barWidth];
    // line requests are in multiples of min bar width
    const barWidth = request.barWidth == BAR_WIDTH.LINE ? Number(Object.values(BAR_WIDTH)[1]) : request.barWidth;
    const barFileState = state[barWidth];

    const clampedStart = clamp(barFileState.firstKey, request.start, barFileState.lastKey);
    let appendLast = false;
    if (request.end > barFileState.lastKey) {
        appendLast = true;
    }
    const clampedEnd = clamp(barFileState.firstKey, request.end + barWidth, barFileState.lastKey + barWidth);

    // calculate bar index file offsets
    let barStart = getOffset(clampedStart, barWidth);
    let barEnd: number;
    if (request.type == REQUEST_TYPE.LIVE) {
        // shift start up to end if too small
        const numBars = (request.end - request.start) / barWidth;
        barStart = Math.max(barStart, barFileState.size - numBars * SIZEOF_INDEX);
        // end is always the last entry
        barEnd = barFileState.size;
        appendLast = true;
    } else {
        barEnd = getOffset(clampedEnd, barWidth);
    }

    let fileStart: number, fileEnd: number;
    // get timestamp offsets
    if (request.barWidth == BAR_WIDTH.LINE) {
        // get start timestamp offset
        fileStart = readUInt32LE(barFileState.fd, barStart);
        // also get the previous timestamp so we can calculate the gradient
        fileStart = Math.max(0, fileStart - SIZEOF_TIMESTAMP);

        // get end timestamp offset
        if (barEnd == barFileState.size) {
            fileEnd = fileState.size;
        } else {
            fileEnd = readUInt32LE(barFileState.fd, barEnd - SIZEOF_INDEX);
            // also get the next timestamp so we can calculate the gradient
            fileEnd = Math.min(fileEnd + SIZEOF_TIMESTAMP, fileState.size);
        }
    } else {
        fileStart = barStart;
        fileEnd = barEnd;
    }

    const end =
        request.type == REQUEST_TYPE.LIVE
            ? getTimestamp(barEnd, barWidth)
            : getTimestamp(barEnd - SIZEOF_INDEX, barWidth);
    return {
        start: getTimestamp(barStart, barWidth),
        end,
        fileStart,
        fileEnd,
    };
}

type WS_State = {
    ws: WebSocket;
    streamingId: number;
};

wss.on('connection', ws => {
    const ws_state = {
        ws,
        streamingId: 0,
    };
    clients.add(ws_state);

    ws.on('message', (data: Buffer) => {
        // parse request
        if (data.byteLength != 5 * SIZEOF_UINT32) {
            console.log(`Invalid request: ${data.byteLength} bytes`);
            return;
        }
        const alignedBuffer = new Uint8Array(data.byteLength);
        alignedBuffer.set(data);
        const requestArray = new Uint32Array(alignedBuffer.buffer);
        const request: REQUEST = {
            id: requestArray[0],
            type: requestArray[1],
            barWidth: requestArray[2],
            start: requestArray[3],
            end: requestArray[4],
        };

        // validate request
        const error = validateRequest(request);
        if (error) {
            console.log(`Invalid request: ${error} `);
            return;
        }

        // get bounds
        const { start, end, fileStart, fileEnd } = getBounds(request);

        // form response
        const response: RESPONSE = {
            id: request.id,
            type: request.barWidth == BAR_WIDTH.LINE ? RESPONSE_TYPE.LINEDATA : RESPONSE_TYPE.BARDATA,
            start,
            end,
            data: null,
        };
        let dataSize = fileEnd - fileStart;
        const responseBuffer = Buffer.alloc(4 * SIZEOF_UINT32 + dataSize);
        const responseHeader = Uint32Array.from(
            Object.values(
                Object.keys(response)
                    .slice(0, -1)
                    .map(key => response[key]),
            ),
        );
        responseBuffer.set(new Uint8Array(responseHeader.buffer), 0);

        // read file
        fs.readSync(state[request.barWidth].fd, responseBuffer, 4 * SIZEOF_UINT32, fileEnd - fileStart, fileStart);

        if (request.barWidth != BAR_WIDTH.LINE) {
            debugger;
            const dataArray = new Uint32Array(responseBuffer.buffer, 4 * SIZEOF_UINT32);

            // calculate differences
            for (let i = 1; i < dataArray.length; i += 1) {
                dataArray[i - 1] = (dataArray[i] - dataArray[i - 1]) / SIZEOF_INDEX;
            }

            // append last
            dataArray[dataArray.length - 1] =
                (state[BAR_WIDTH.LINE].size - dataArray[dataArray.length - 1]) / SIZEOF_INDEX;
        }

        // send response
        ws.send(responseBuffer);

        // start streaming
        if (request.type == REQUEST_TYPE.LIVE) {
            ws_state.streamingId = request.id;
        }
    });

    ws.on('close', () => {
        clients.delete(ws_state);
    });
});

export default wss;
