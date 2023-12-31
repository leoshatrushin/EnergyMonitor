import { TIMESTAMP_SIZE } from '../common/constants';

const PROTOCOL = import.meta.env.VITE_PROTOCOL;
const WS_PROTOCOL = PROTOCOL === 'https' ? 'wss' : 'ws';
const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_HOST_PORT;

const ws = new WebSocket(`${WS_PROTOCOL}://${HOST}:${PORT}`);
ws.binaryType = 'arraybuffer';
await new Promise(resolve => (ws.onopen = resolve));

let receivingData = false;
let receivingDataResolver: (value: ArrayBuffer) => void;

export async function getData(start: number, end: number) {
    const buffer = new ArrayBuffer(TIMESTAMP_SIZE * 2);
    const view = new DataView(buffer);
    view.setBigUint64(0, BigInt(start), true);
    view.setBigUint64(TIMESTAMP_SIZE, BigInt(end), true);
    ws.send(buffer);

    // wait for data to be received
    const data = await new Promise<ArrayBuffer>(resolve => {
        receivingDataResolver = resolve;
    });
    return data;
}

const timeStampHandlers: ((timestamp: number) => void)[] = [];
export function installTimestampHandler(handler: (timestamp: number) => void) {
    timeStampHandlers.push(handler);
}

let dataBuffer: ArrayBuffer = new ArrayBuffer(0);
let numDataBytes = 0;

ws.onmessage = function (event) {
    const data: ArrayBuffer = event.data;

    if (receivingData) {
        // concatenate data
        const concatenatedBuffer = new ArrayBuffer(dataBuffer.byteLength + data.byteLength);
        const concatenatedView = new Uint8Array(concatenatedBuffer);
        concatenatedView.set(new Uint8Array(dataBuffer), 0);
        concatenatedView.set(new Uint8Array(data), dataBuffer.byteLength);
        dataBuffer = concatenatedBuffer;

        // check if all data has been received
        numDataBytes -= data.byteLength;
        if (numDataBytes === 0) {
            receivingData = false;
            receivingDataResolver(dataBuffer);
        }

        return;
    }

    const view = new DataView(data);
    const timestamp = Number(view.getBigUint64(0, true));

    // check if message is a data header
    if (timestamp === 0) {
        numDataBytes = view.getUint32(8, true);
        console.log(`Receiving ${numDataBytes} bytes of data`);
        if (numDataBytes > 0) receivingData = true;
        else receivingDataResolver(new ArrayBuffer(0));
        return;
    }

    console.log(timestamp);
    for (const handler of timeStampHandlers) {
        handler(timestamp);
    }
};
