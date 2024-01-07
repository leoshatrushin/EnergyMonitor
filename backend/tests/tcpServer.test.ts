import { jest } from '@jest/globals';
import net from 'net';
import tls from 'tls';
import fs from 'fs';
import '../src/startup';

const BAR_WIDTH = {
    LINE: 0,
    BAR_1m: 60000,
    BAR_5m: 300000,
};

jest.unstable_mockModule('../src/common/constants', () => {
    const originalModule = jest.requireActual('../src/common/constants') as any;
    const res = {
        ...originalModule,
        BAR_WIDTH,
    };
    console.log('LOGGING RES');
    console.log(res);
    return res;
});

jest.mock('../src/constants', () => {
    const originalModule = jest.requireActual('../src/constants') as any;
    return {
        ...originalModule,
        fileNames: {
            [BAR_WIDTH.LINE]: '../../tests/data/timestamps.bin',
            [BAR_WIDTH.BAR_1m]: '../../tests/data/minutes.bin',
            [BAR_WIDTH.BAR_5m]: '../../tests/data/5minutes.bin',
        },
    };
});

const SIZEOF_UINT32 = 4;

describe('Mocking Test', () => {
    it('should use mocked constants', async () => {
        const filenames = await import('../src/constants');
        console.log('LOGGING FILENAMES');
        console.log(filenames);
    });
});

// reset data directory
const dataDir = 'data';
fs.readdirSync(dataDir).forEach(file => {
    fs.unlinkSync(`${dataDir}/${file}`);
});

// start tcp server
require('../src/tcpServer');

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

let numTimestampsSent = 0;
client.on(connectedEvent, () => {
    client.write(process.env.SENSOR_API_KEY);

    for (let i = 0; i < 15; i++) {
        const buffer = Buffer.alloc(SIZEOF_UINT32);
        for (let j = 0; j < i; j++) {
            buffer.writeUInt32LE(i * MINUTE + j);
            client.write(buffer);
            numTimestampsSent++;
        }
    }

    setTimeout(() => {
        clientFinishedResolver(null);
    }, 500);
});

describe('tcpServer', () => {
    it('should have written timestamps correctly', async () => {
        await clientFinished;
        const data = fs.readFileSync('./data/timestamps.bin');
        const timestamps = new Uint32Array(data.buffer);

        expect(timestamps.length).toBe(numTimestampsSent);

        for (let i = 0; i < timestamps.length; i++) {
            for (let j = 0; j < SIZEOF_UINT32; j++) {
                expect(data[i * SIZEOF_UINT32 + j]).toBe(i * MINUTE + j);
            }
        }

        process.exit(0);
    });
});
