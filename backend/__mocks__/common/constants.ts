export const SIZEOF_UINT32 = 4;

export enum BAR_WIDTH {
    LINE = 0,
    BAR_1m = 60 * 1000,
}

export enum REQUEST_TYPE {
    INTERVAL = 0,
    LIVE = 1,
}

export type REQUEST = {
    id: number;
    type: REQUEST_TYPE;
    barWidth: BAR_WIDTH;
    start: number;
    end: number;
};

export type RESPONSE = {
    id: number;
    start: number;
    end: number;
    dataSize: number;
    data: ArrayBuffer;
};
