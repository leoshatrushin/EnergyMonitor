import { jest } from '@jest/globals';

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

jest.unstable_mockModule('../src/constants', () => {
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
