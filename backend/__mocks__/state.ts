import fs from 'fs';
import { SIZEOF_UINT32, BAR_WIDTH } from './common/constants';
import { fileNames, FILE_STATE } from './constants';
import { roundDown } from './common/utils';
import { readUInt32LE } from './utils';

let state: { [key in BAR_WIDTH]: FILE_STATE };

const timestampsFd = fs.openSync(`./data/${fileNames[BAR_WIDTH.LINE]}`, 'r');
const timestampsFileSize = fs.fstatSync(timestampsFd).size;
const timestampFileState: FILE_STATE = {
    fd: timestampsFd,
    size: timestampsFileSize,
    firstKey: readUInt32LE(timestampsFd, 0),
    lastKey: readUInt32LE(timestampsFd, timestampsFileSize - SIZEOF_UINT32),
    lastOffset: 0,
};
state[BAR_WIDTH.LINE] = timestampFileState;

for (const barWidth in fileNames) {
    if (barWidth == String(BAR_WIDTH.LINE)) continue;
    const fd = fs.openSync(`./data/${fileNames[barWidth]}`, 'r');
    const fileSize = fs.fstatSync(fd).size;
    const fileState: FILE_STATE = {
        fd,
        size: fileSize,
        firstKey: roundDown(timestampFileState.firstKey, Number(barWidth)),
        lastKey: roundDown(timestampFileState.lastKey, Number(barWidth)),
        lastOffset: readUInt32LE(fd, fileSize - SIZEOF_UINT32),
    };
    state[barWidth] = fileState;
}

export default state;
