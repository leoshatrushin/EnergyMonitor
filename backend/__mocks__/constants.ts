import { BAR_WIDTH } from './common/constants';

export type FILE_STATE = {
    fd: number;
    size: number;
    firstKey: number;
    lastKey: number;
    lastOffset: number;
};

export const fileNames: { [key in BAR_WIDTH]: string } = {
    [BAR_WIDTH.LINE]: 'timestamps.bin',
    [BAR_WIDTH.BAR_1m]: 'minutes.bin',
};
