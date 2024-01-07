export class StreamReader {
    private buffer: Uint8Array;
    private offset: number;
    bytesLeft: number;
    constructor(initialData?: Uint8Array) {
        this.offset = 0;
        this.buffer = initialData ? initialData : new Uint8Array(0);
        this.bytesLeft = initialData ? initialData.byteLength : 0;
    }
    readInto(data: Uint8Array) {
        if (this.buffer) {
            const newBuffer = new Uint8Array(this.buffer.byteLength + data.byteLength);
            newBuffer.set(this.buffer);
            newBuffer.set(data, this.buffer.byteLength);
            this.buffer = newBuffer;
        } else {
            this.buffer = data;
        }
        this.bytesLeft += data.byteLength;
    }
    readBytes(numBytes: number) {
        if (!this.buffer) return null;
        if (this.buffer.length - this.offset < numBytes) return null;
        const res = this.buffer.subarray(this.offset, this.offset + numBytes);
        this.offset += numBytes;
        this.bytesLeft -= numBytes;
        return res;
    }
    eraseProcessedBytes() {
        this.buffer = this.buffer.subarray(this.offset);
        this.offset = 0;
        this.bytesLeft = this.buffer.byteLength;
    }
}

export function to2020Date(timestamp: number) {
    return timestamp - Date.UTC(2020);
}

export function roundDown(input: number, multiple: number) {
    return input - (input % multiple);
}
