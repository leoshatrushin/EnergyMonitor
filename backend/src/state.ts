import fs from 'fs';
import { TIMESTAMP_SIZE, MINUTE } from './common/constants.js';
import { roundDown } from './common/utils.js';

let timestampFileOffset = 0;
let firstMinute: number = 0;
let lastMinute: number = 0;
{
    const timestampFd = fs.openSync('./data/timestamps.bin', 'r');
    timestampFileOffset = fs.fstatSync(timestampFd).size;

    const timestampBuf = Buffer.alloc(TIMESTAMP_SIZE);

    const firstBytesRead = fs.readSync(timestampFd, timestampBuf, 0, TIMESTAMP_SIZE, 0);
    if (firstBytesRead != TIMESTAMP_SIZE) throw new Error(`expected ${TIMESTAMP_SIZE} bytes, got ${firstBytesRead}`);
    firstMinute = roundDown(Number(timestampBuf.readBigUInt64LE(0)), MINUTE);

    const lastBytesRead = fs.readSync(
        timestampFd,
        timestampBuf,
        0,
        TIMESTAMP_SIZE,
        timestampFileOffset - TIMESTAMP_SIZE,
    );
    if (lastBytesRead != TIMESTAMP_SIZE) throw new Error(`expected ${TIMESTAMP_SIZE} bytes, got ${lastBytesRead}`);
    lastMinute = roundDown(Number(timestampBuf.readBigUInt64LE(0)), MINUTE);

    fs.closeSync(timestampFd);
}

type stateType = {
    timestampFileOffset: number;
    firstMinute: number;
    lastMinute: number;
};

const state: stateType = {
    timestampFileOffset,
    firstMinute,
    lastMinute,
};
export default state;
