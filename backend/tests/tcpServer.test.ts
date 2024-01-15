import { jest } from '@jest/globals';
import net from 'net';
import tls from 'tls';
import fs from 'fs';
import '../src/startup';
import path from 'node:path/posix';

const BAR_WIDTH = {
    LINE: 0,
    BAR_1m: 60000,
    BAR_5m: 300000,
};

jest.mock('../src/common/constants', () => {
    const originalModule = jest.requireActual('../src/common/constants') as any;
    const res = {
        ...originalModule,
        BAR_WIDTH,
    };
    return res;
});

jest.mock('../src/constants', () => {
    const path = require('path');
    const originalModule = jest.requireActual('../src/constants') as any;
    return {
        ...originalModule,
        dataDir: path.resolve('./tests/tcpserverdata'),
        fileNames: {
            [BAR_WIDTH.LINE]: 'timestamps.bin',
            [BAR_WIDTH.BAR_1m]: 'minutes.bin',
            [BAR_WIDTH.BAR_5m]: '5minutes.bin',
        },
    };
});

const SIZEOF_UINT32 = 4;

const dataDir = path.resolve('./tests/tcpserverdata');
fs.readdirSync(dataDir).forEach(file => {
    fs.unlinkSync(path.join(dataDir, file));
});

// start tcp server
require('../src/tcpServer');
const STARTUP_TIME = 500;

const SENSOR_PORT = Number(process.env.SENSOR_PORT);

let client: tls.TLSSocket | net.Socket;
let connectedEvent = 'connect';
if (process.env.mode === 'production') {
    client = tls.connect(SENSOR_PORT, 'localhost');
    connectedEvent = 'secureConnect';
} else {
    client = new net.Socket().connect(SENSOR_PORT, 'localhost');
}

const MINUTE = 60000;

let clientFinishedResolver: (value: unknown) => void;
const clientFinished = new Promise(resolve => {
    clientFinishedResolver = resolve;
});

const NUM_MINUTES = 20;
function iterate(fn: (i: number, j: number, state: any) => void, initialState: any) {
    let state = initialState;
    for (let i = 0; i < NUM_MINUTES; i++) {
        // i timestamps per minute
        for (let j = 0; j < i; j++) {
            state = fn(i, j, state);
        }
    }
}

async function writeTimestamp(i: number, j: number) {
    if (i > 15) await new Promise(resolve => setTimeout(resolve, 100));
    const buffer = Buffer.alloc(SIZEOF_UINT32);
    buffer.writeUInt32LE(i * MINUTE + j);
    client.write(buffer);
    numTimestampsSent++;
}

function checkTimestamps(i: number, j: number, state: { timestamps: Uint32Array; count: number }) {
    const { timestamps, count } = state;
    expect(timestamps[count]).toBe(i * MINUTE + j);
    return { timestamps, count: count + 1 };
}

let numTimestampsSent = 0;
client.on(connectedEvent, async () => {
    client.write(process.env.SENSOR_API_KEY);

    iterate(writeTimestamp, null);

    setTimeout(() => {
        clientFinishedResolver(null);
    }, STARTUP_TIME);
});

describe('tcpServer', () => {
    it('should have written the correct number of timestamps', async () => {
        await clientFinished;
        const size = fs.fstatSync(fs.openSync('./tests/tcpserverdata/timestamps.bin', 'r')).size;
        expect(size).toBe(numTimestampsSent * SIZEOF_UINT32);
    });

    it('should have written timestamps correctly', async () => {
        await clientFinished;

        const data = fs.readFileSync('./tests/tcpserverdata/timestamps.bin');

        const timestamps = new Uint32Array(data.buffer, data.byteOffset, numTimestampsSent);
        const count = 0;

        iterate(checkTimestamps, { timestamps, count });
    });

    it('should have written the correct number of minutes', async () => {
        await clientFinished;
        const size = fs.fstatSync(fs.openSync('./tests/tcpserverdata/minutes.bin', 'r')).size;
        expect(size).toBe((NUM_MINUTES - 1) * SIZEOF_UINT32);
    });

    it('should have written minutes correctly', async () => {
        await clientFinished;
        const data = fs.readFileSync('./tests/tcpserverdata/minutes.bin');
        const minutes = new Uint32Array(data.buffer, data.byteOffset, NUM_MINUTES - 1);
        let count = 0;
        for (let i = 1; i < NUM_MINUTES; i++) {
            expect(minutes[i - 1]).toBe(count * SIZEOF_UINT32);
            count += i;
        }
    });

    it('should have written the correct number of 5 minutes', async () => {
        await clientFinished;
        const size = fs.fstatSync(fs.openSync('./tests/tcpserverdata/5minutes.bin', 'r')).size;
        expect(size).toBe((NUM_MINUTES / 5) * SIZEOF_UINT32);
    });

    it('should have written 5 minutes correctly', async () => {
        await clientFinished;
        const data = fs.readFileSync('./tests/tcpserverdata/5minutes.bin');
        const offsets = new Uint32Array(data.buffer, data.byteOffset, NUM_MINUTES / 5);
        let count = 0;
        for (let i = 0; i < NUM_MINUTES; i++) {
            if (i % 5 == 0) {
                expect(offsets[Math.floor(i / 5)]).toBe(count * SIZEOF_UINT32);
            }
            count += i;
        }
    });
});
