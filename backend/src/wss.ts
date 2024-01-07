import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { REQUEST_TYPE, REQUEST, SIZEOF_UINT32, BAR_WIDTH } from './common/constants';
import state from './state';
import { readUInt32LE } from './utils';

const wss = new WebSocketServer({ noServer: true });
const clients = new Set<WS_State>();

// stream timestamps
wss.on('timestamp', (timestampbuf: Buffer) => {
    for (const ws_state of clients) {
        // skip if not streaming
        if (ws_state.streamingId == 0) continue;

        // form response
        const buffer = Buffer.alloc(4 * SIZEOF_UINT32 + timestampbuf.byteLength);
        buffer.writeUInt32LE(0, ws_state.streamingId);
        buffer.writeUInt32LE(timestampbuf.readUInt32LE(0), 4);
        buffer.writeUInt32LE(timestampbuf.readUInt32LE(timestampbuf.byteLength - SIZEOF_UINT32), 8);
        buffer.writeUInt32LE(timestampbuf.byteLength, 12);
        buffer.set(timestampbuf, 16);

        // send response
        ws_state.ws.send(buffer);
    }
});

const MAX_REQUEST_SIZE = 1000;

function validateRequest(request: REQUEST) {
    // check validity
    if (!(request.type in REQUEST_TYPE)) return `Invalid request type ${request.type}`;
    if (!(request.barWidth in BAR_WIDTH)) return `Invalid bar width ${request.barWidth}`;
    if (request.start > request.end)
        return `Invalid request bounds start ${request.start} greater than end ${request.end}`;
    let barWidth = request.barWidth;
    if (request.barWidth == BAR_WIDTH.LINE) barWidth = Number(Object.keys(BAR_WIDTH)[1]);
    if (request.type != REQUEST_TYPE.LIVE) {
        if (request.start % request.barWidth || request.end % request.barWidth)
            return `Non-aligned request bounds start ${request.start}, end ${request.end}, barWidth ${request.barWidth}`;
    }

    // check size
    if (request.type == REQUEST_TYPE.LIVE && request.end > MAX_REQUEST_SIZE)
        return `Request size ${request.end} too large`;
    else {
        const requestSize = (request.end - request.start) / barWidth;
        if (requestSize > MAX_REQUEST_SIZE) return `Request size ${requestSize} too large`;
    }

    return '';
}

function getOffset(timestamp: number, barWidth: BAR_WIDTH) {
    const fileState = state[barWidth];
    return ((timestamp - fileState.firstKey) / barWidth) * SIZEOF_UINT32;
}

function clamp(min: number, value: number, max: number) {
    return Math.min(Math.max(min, value), max);
}

function getBounds(request: REQUEST): {
    start: number;
    end: number;
    fileStart: number;
    fileEnd: number;
    appendLast: boolean;
} {
    const fileState = state[request.barWidth];
    // line requests are in multiples of min bar width
    const barWidth = request.barWidth == BAR_WIDTH.LINE ? Number(Object.keys(BAR_WIDTH)[1]) : request.barWidth;
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
        barStart = Math.max(barStart, barFileState.size - numBars * SIZEOF_UINT32);
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
        fileStart = Math.max(0, fileStart - SIZEOF_UINT32);

        // get end timestamp offset
        if (barEnd == barFileState.size) {
            fileEnd = fileState.size;
        } else {
            fileEnd = readUInt32LE(barFileState.fd, barEnd);
            // also get the next timestamp so we can calculate the gradient
            fileEnd = Math.min(fileEnd + SIZEOF_UINT32, fileState.size);
        }
    } else {
        fileStart = barStart;
        fileEnd = barEnd;
    }

    return { start: barStart, end: barEnd - barWidth, fileStart, fileEnd, appendLast };
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

    ws.on('message', (data: ArrayBuffer) => {
        // parse request
        if (data.byteLength != 5 * SIZEOF_UINT32) {
            console.log(`Invalid request: ${data.byteLength} bytes`);
            return;
        }
        data = new Uint32Array(data);
        const request: REQUEST = {
            id: data[0],
            type: data[1],
            barWidth: data[2],
            start: data[3],
            end: data[4],
        };
        console.log(`received ws request: ${request} `);

        // validate request
        const error = validateRequest(request);
        if (error) {
            console.log(`Invalid request: ${error} `);
            return;
        }

        // get bounds
        const { start, end, fileStart, fileEnd, appendLast } = getBounds(request);

        // read file
        let dataSize = fileEnd - fileStart;
        // n elements have n-1 differences
        if (request.barWidth != BAR_WIDTH.LINE) dataSize -= SIZEOF_UINT32;
        if (appendLast) dataSize += SIZEOF_UINT32;
        const buffer = Buffer.alloc(4 * SIZEOF_UINT32 + fileEnd - fileStart);
        buffer.writeUInt32LE(request.id, 0);
        buffer.writeUInt32LE(start, 4);
        buffer.writeUInt32LE(end, 8);
        buffer.writeUInt32LE(dataSize, 12);
        fs.readSync(state[request.barWidth].fd, buffer, 4 * SIZEOF_UINT32, fileEnd - fileStart, fileStart);

        // calculate differences
        const array = new Uint32Array(buffer.buffer, 4 * SIZEOF_UINT32);
        if (request.barWidth != BAR_WIDTH.LINE) {
            for (let i = 1; i < array.length; i += 1) {
                array[i - 1] = array[i] - array[i - 1];
            }
        }

        // append last
        if (appendLast) {
            array[array.length - 1] = state[BAR_WIDTH.LINE].size - SIZEOF_UINT32 - array[array.length - 1];
        }

        // send response
        ws.send(buffer.subarray(0, 4 * SIZEOF_UINT32 + dataSize));

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
