import '../src/startup';
import WebSocket from 'ws';
import { REQUEST, RESPONSE, REQUEST_TYPE, RESPONSE_TYPE } from '../src/common/constants';

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
        dataDir: path.resolve('./tests/wssdata'),
        fileNames: {
            [BAR_WIDTH.LINE]: 'timestamps.bin',
            [BAR_WIDTH.BAR_1m]: 'minutes.bin',
            [BAR_WIDTH.BAR_5m]: '5minutes.bin',
        },
    };
});

require('../src/httpServer');

const FRONTEND_PORT = process.env.FRONTEND_PORT;
const CLIENT_API_KEY = process.env.CLIENT_API_KEY;
const SIZEOF_UINT32 = 4;
const NUM_MINUTES = 20;
const MINUTE = 60000;

const ws = new WebSocket(`ws://localhost:${FRONTEND_PORT}`, {
    headers: {
        cookie: `apiKey=${CLIENT_API_KEY}`,
    },
});

function writeRequest(request: REQUEST) {
    const buffer = Buffer.alloc(5 * SIZEOF_UINT32);
    buffer.writeUInt32LE(request.id, 0);
    buffer.writeUInt32LE(request.type, 4);
    buffer.writeUInt32LE(request.barWidth, 8);
    buffer.writeUInt32LE(request.start, 12);
    buffer.writeUInt32LE(request.end, 16);
    return buffer;
}

function readResponse(data: Buffer): RESPONSE {
    const id = data.readUInt32LE(0);
    const type = data.readUInt32LE(4);
    const start = data.readUInt32LE(8);
    const end = data.readUInt32LE(12);
    const alignedBuffer = new Uint8Array(data.byteLength - 16);
    alignedBuffer.set(data.subarray(16));
    const dataBuf = new Uint32Array(alignedBuffer.buffer);
    return {
        id,
        type,
        start,
        end,
        data: dataBuf,
    };
}

describe('websocket interval requests', () => {
    it('should respond properly for line data within bounds', async () => {
        const request: REQUEST = {
            id: 1,
            type: REQUEST_TYPE.INTERVAL,
            barWidth: BAR_WIDTH.LINE,
            start: 60000,
            end: (NUM_MINUTES - 2) * MINUTE,
        };
        const buffer = writeRequest(request);

        await new Promise(resolve => {
            function checkResponse(responseBuf: Buffer) {
                const { id, type, start, end, data } = readResponse(responseBuf);

                expect(id).toEqual(request.id);
                expect(type).toEqual(RESPONSE_TYPE.DATA);
                expect(start).toEqual(request.start);
                expect(end).toEqual(request.end);
                let sum = 0;
                for (let i = 0; i < NUM_MINUTES - 2; i++) sum += i;
                expect(data.byteLength).toEqual(sum * SIZEOF_UINT32 + SIZEOF_UINT32);
                let count = 0;
                for (let i = 0; i < NUM_MINUTES - 2; i++) {
                    for (let j = 0; j < i; j++) {
                        expect(data[count]).toEqual(i * MINUTE + j);
                        count++;
                    }
                }

                ws.removeListener('message', checkResponse);
                resolve(null);
            }
            ws.on('message', checkResponse);

            ws.on('open', () => {
                ws.send(buffer);
            });
        });
    });

    it('should respond properly for live line data requests', async () => {
        const request: REQUEST = {
            id: 2,
            type: REQUEST_TYPE.LIVE,
            barWidth: BAR_WIDTH.LINE,
            start: 60000,
            end: (NUM_MINUTES - 2) * MINUTE,
        };
        const buffer = writeRequest(request);
        ws.send(buffer);

        await new Promise(resolve => {
            function checkResponse(responseBuf: Buffer) {
                const { id, type, start, end, data } = readResponse(responseBuf);

                expect(id).toEqual(request.id);
                expect(type).toEqual(RESPONSE_TYPE.DATA);
                expect(start).toEqual((NUM_MINUTES - 17) * MINUTE);
                expect(end).toEqual(NUM_MINUTES * MINUTE);
                let sum = 0;
                for (let i = NUM_MINUTES - 17; i < NUM_MINUTES; i++) sum += i;
                expect(data.byteLength).toEqual(SIZEOF_UINT32 + sum * SIZEOF_UINT32);
                expect(data[0]).toEqual((NUM_MINUTES - 18) * MINUTE + (NUM_MINUTES - 19));
                let count = 1;
                for (let i = NUM_MINUTES - 17; i < NUM_MINUTES; i++) {
                    for (let j = 0; j < i; j++) {
                        expect(data[count]).toEqual(i * MINUTE + j);
                        count++;
                    }
                }

                ws.removeListener('message', checkResponse);
                resolve(null);
            }
            ws.on('message', checkResponse);
        });
    });

    it('should respond properly for live minute bar requests', async () => {
        const request: REQUEST = {
            id: 3,
            type: REQUEST_TYPE.LIVE,
            barWidth: BAR_WIDTH.BAR_1m,
            start: MINUTE,
            end: (NUM_MINUTES - 2) * MINUTE,
        };
        const buffer = writeRequest(request);
        ws.send(buffer);

        await new Promise(resolve => {
            function checkResponse(responseBuf: Buffer) {
                const { id, type, start, end, data } = readResponse(responseBuf);
                const numBars = (request.end - request.start) / request.barWidth;
                debugger;

                expect(id).toEqual(request.id);
                expect(type).toEqual(RESPONSE_TYPE.DATA);
                expect(start).toEqual((NUM_MINUTES - numBars) * MINUTE);
                expect(end).toEqual(NUM_MINUTES * MINUTE);
                expect(data.byteLength).toEqual(numBars * SIZEOF_UINT32);
                for (let i = 0; i < numBars; i++) {
                    expect(data[i]).toEqual(NUM_MINUTES - numBars + i);
                }

                ws.removeListener('message', checkResponse);
                resolve(null);
            }
            ws.on('message', checkResponse);
        });
    });
});
