const BAR_WIDTH = {
    LINE: 0,
    BAR_1m: 60000,
    BAR_5m: 300000,
};

jest.mock('./common/constants', () => {
    const originalModule = jest.requireActual('../src/common/constants');
    return {
        ...originalModule,
        BAR_WIDTH,
    };
});

jest.mock('./constants', () => {
    const originalModule = jest.requireActual('../src/constants');
    return {
        ...originalModule,
        fileNames: {
            [BAR_WIDTH.LINE]: '../../tests/data/timestamps.bin',
            [BAR_WIDTH.BAR_1m]: '../../tests/data/minutes.bin',
            [BAR_WIDTH.BAR_5m]: '../../tests/data/5minutes.bin',
        },
    };
});

import '../src/startup';
import '../src/wss';
import WebSocket from 'ws';

const SERVER_PORT = process.env.SERVER_PORT;
const CLIENT_API_KEY = process.env.CLIENT_API_KEY;

const ws = new WebSocket(`ws://localhost:${SERVER_PORT}`, {
    headers: {
        cookie: `apiKey=${CLIENT_API_KEY}`,
    },
});

await new Promise(resolve => {
    ws.on('open', resolve);
});

describe('websocket interval requests', () => {
    it('should respond with all data when in file bounds', () => {
        // Your test code here
        // Call yourFunction or other functions that rely on the mocked modules
        // Assert the expected behavior
    });

    // More tests as needed
});
