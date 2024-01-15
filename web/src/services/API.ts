import { BAR_WIDTH, REQUEST_TYPE, REQUEST, RESPONSE, RESPONSE_TYPE } from '../common/constants';

const PROTOCOL = import.meta.env.VITE_PROTOCOL;
const WS_PROTOCOL = PROTOCOL === 'https' ? 'wss' : 'ws';
const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_HOST_PORT;

const ws = new WebSocket(`${WS_PROTOCOL}://${HOST}:${PORT}`);
ws.binaryType = 'arraybuffer';
await new Promise(resolve => (ws.onopen = resolve));

let idCounter = 0;
let forwardDataId: number;
let forwardData: (data: Uint32Array) => void;
export async function getData(requestType: REQUEST_TYPE, barwidth: BAR_WIDTH, start: number, end: number) {
    const request: REQUEST = {
        id: idCounter++,
        type: requestType,
        barWidth: barwidth,
        start,
        end,
    };
    forwardDataId = request.id;
    const requestBuffer = Uint32Array.from(Object.values(request));
    ws.send(requestBuffer);

    // wait for data to be received
    const data = await new Promise<Uint32Array>(resolve => {
        forwardData = resolve;
    });
    return data;
}

ws.onmessage = function (event) {
    const data: Uint8Array = event.data;
    const alignedBuffer = new Uint8Array(data.byteLength);
    alignedBuffer.set(data);
    const array = new Uint32Array(alignedBuffer.buffer);
    const response: RESPONSE = {
        id: array[0],
        type: array[1],
        start: array[2],
        end: array[3],
        data: array.slice(4),
    };

    if (response.id == forwardDataId && response.type == RESPONSE_TYPE.DATA) {
        forwardData(response.data);
    }

    if (response.type == RESPONSE_TYPE.TIMESTAMP) {
        timeStampHandlers.forEach(handler => handler(response.data[0]));
    }
};

const timeStampHandlers: ((timestamp: number) => void)[] = [];

export function installTimestampHandler(handler: (timestamp: number) => void) {
    timeStampHandlers.push(handler);
}

export function clearTimestampHandlers() {
    timeStampHandlers.length = 0;
}
