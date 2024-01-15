export const SIZEOF_UINT32 = 4;

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
export const MONTH = 30 * DAY;

export enum BAR_WIDTH {
    LINE = 0,
    BAR_5m = 5 * MINUTE,
    BAR_1h = HOUR,
    BAR_1d = DAY,
}

export enum REQUEST_TYPE {
    INTERVAL = 0,
    LIVE = 1,
}

export enum RESPONSE_TYPE {
    DATA = 0,
    TIMESTAMP = 1,
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
    type: RESPONSE_TYPE;
    start: number;
    end: number;
    data: Uint32Array;
};
