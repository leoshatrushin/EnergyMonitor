import fs from 'fs';
import path from 'path';
import { BAR_WIDTH, SIZEOF_TIMESTAMP, SIZEOF_INDEX } from './common/constants';
import { fileNames, FILE_STATE, dataDir } from './constants';
import { roundDown } from './common/utils';
import { readUInt32LE, readUInt64LE } from './utils';

let state: { [key in BAR_WIDTH]: FILE_STATE } = {} as { [key in BAR_WIDTH]: FILE_STATE };

for (const filename in fileNames) {
    const fd = fs.openSync(path.join(dataDir, fileNames[filename]), 'a');
    fs.closeSync(fd);
}

const timestampsFd = fs.openSync(path.join(dataDir, fileNames[BAR_WIDTH.LINE]), 'r+');
const timestampsFileSize = fs.fstatSync(timestampsFd).size;
const timestampFileState: FILE_STATE = {
    fd: timestampsFd,
    size: timestampsFileSize,
    firstKey: timestampsFileSize > 0 ? readUInt64LE(timestampsFd, 0) : 0,
    lastKey: timestampsFileSize > 0 ? readUInt64LE(timestampsFd, timestampsFileSize - SIZEOF_TIMESTAMP) : 0,
    lastOffset: 0,
};
state[BAR_WIDTH.LINE] = timestampFileState;

for (const barWidthStr in fileNames) {
    const barWidth = Number(barWidthStr);
    if (barWidth == BAR_WIDTH.LINE) continue;
    const fd = fs.openSync(path.join(dataDir, fileNames[barWidth]), 'r+');
    const fileSize = fs.fstatSync(fd).size;
    const fileState: FILE_STATE = {
        fd,
        size: fileSize,
        firstKey: roundDown(timestampFileState.firstKey, barWidth),
        lastKey: roundDown(timestampFileState.lastKey, barWidth),
        lastOffset: fileSize > 0 ? readUInt32LE(fd, fileSize - SIZEOF_INDEX) : 0,
    };
    state[barWidth] = fileState;
}

export default state;
