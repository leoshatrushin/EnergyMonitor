export class StreamReader {
    offset: number;
    bytesLeft: number;
    buffer: Uint8Array;
    constructor(initialData?: Uint8Array) {
        this.offset = 0;
        this.buffer = initialData ? initialData : new Uint8Array(0);
        this.bytesLeft = initialData ? initialData.length : 0;
    }
    readInto(data: Uint8Array) {
        if (this.buffer) {
            const newBuffer = new Uint8Array(this.buffer.length + data.length);
            newBuffer.set(this.buffer);
            newBuffer.set(data, this.buffer.length);
            this.buffer = newBuffer;
        } else {
            this.buffer = data;
        }
        this.bytesLeft += data.length;
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
        this.bytesLeft = this.buffer.length;
    }
}

export function roundDown(input: number, multiple: number) {
    return input - (input % multiple);
}
