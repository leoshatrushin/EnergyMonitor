export const SIZEOF_UINT32 = 4;
export const SIZEOF_TIMESTAMP = 8;
export const SIZEOF_INDEX = 4;

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
    LINEDATA = 0,
    BARDATA = 1,
    TIMESTAMP = 2,
}

/*
 * UInt32 for all fields
 * id - unique id for request
 * type - LIVE or INTERVAL
 * barWidth (ms) - BAR_WIDTH value, 0 for line data
 * start and end (ms) - multiple of barWidth. For line data, multiple of smallest non-zero BAR_WIDTH
 */
export type REQUEST = {
    id: number;
    type: REQUEST_TYPE;
    barWidth: BAR_WIDTH;
    start: number;
    end: number;
};

/*
 * UInt32 for all fields
 * id - same as request id. For streaming timestamps, id of most recent LIVE request
 * type - LINEDATA if request barWidth 0, BARDATA otherwise, TIMESTAMP for streaming timestamps
 * start and end (ms) - multiple of barWidth.
 */
export type RESPONSE = {
    id: number;
    type: RESPONSE_TYPE;
    start: number;
    end: number;
    data: ArrayBuffer;
};
