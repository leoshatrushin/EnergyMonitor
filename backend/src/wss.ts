import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { TIMESTAMP_SIZE, MINUTE, FILE_OFFSET_SIZE } from './common/constants.js';
import state from './state.js';

type WSState = {
    ws: WebSocket;
    sendingData: boolean;
    bufferedTimestamps: Buffer[];
};

const wss = new WebSocketServer({ noServer: true });
const clients = new Set<WSState>();

// stream new timestamps if not sending data, else buffer them
wss.on('timestamps', (timestampbuf: Buffer) => {
    for (const client of clients) {
        if (client.sendingData) client.bufferedTimestamps.push(timestampbuf);
        client.ws.send(timestampbuf);
    }
});

wss.on('connection', ws => {
    const client = {
        ws,
        sendingData: true,
        bufferedTimestamps: [],
    };
    clients.add(client);

    // respond to data request
    ws.on('message', data => {
        // parse request
        const startMinute = Number((data as Buffer).readBigUInt64LE(0));
        const endMinute = Number((data as Buffer).readBigUInt64LE(TIMESTAMP_SIZE));
        console.log('received ws request: ', startMinute, endMinute);

        // calculate file offsets
        let start = ((startMinute - state.firstMinute) / MINUTE) * FILE_OFFSET_SIZE;
        let end = ((endMinute - state.firstMinute) / MINUTE) * FILE_OFFSET_SIZE;
        const extraMinsRequested = (endMinute - state.lastMinute) / MINUTE;
        if (extraMinsRequested > 0) {
            end -= extraMinsRequested * FILE_OFFSET_SIZE;
        }
        end += FILE_OFFSET_SIZE - 1;
        if (startMinute > state.lastMinute) {
            start = end + 1;
        }
        const numMinutes = (end + 1 - start) / FILE_OFFSET_SIZE;

        // send identifying header of format 0*TIMESTAMP_SIZE + numBytes*FILE_OFFSET_SIZE
        const header = Buffer.alloc(TIMESTAMP_SIZE + FILE_OFFSET_SIZE);
        header.writeBigUInt64LE(BigInt(0));
        header.writeUInt32LE(numMinutes * FILE_OFFSET_SIZE, TIMESTAMP_SIZE);
        ws.send(header);

        // send minutes
        if (startMinute > state.lastMinute) return;
        let sendingData = true;
        const minutesReadStream = fs.createReadStream('./data/minutes.bin', { start, end });
        minutesReadStream.on('data', (chunk: Buffer) => {
            console.log('sending data to client');
            console.log(chunk.length);
            console.log(start, end);
            const minutesFd = fs.openSync('./data/minutes.bin', 'r');
            console.log(fs.fstatSync(minutesFd).size);
            ws.send(chunk);
        });

        // send buffered new timestamps
        minutesReadStream.on('end', () => {
            sendingData = false;
            if (client.bufferedTimestamps.length > 0) {
                ws.send(Buffer.concat(client.bufferedTimestamps));
            }
        });
    });

    ws.on('close', () => {
        clients.delete(client);
    });
});

export default wss;
