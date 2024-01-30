export class StreamReader {
    private buffer: Uint8Array;
    private offset: number;
    bytesLeft: number;
    constructor(initialData?: Uint8Array) {
        this.buffer = initialData ? initialData : new Uint8Array(0);
        this.offset = 0;
        this.bytesLeft = initialData ? initialData.byteLength : 0;
    }
    readInto(data: Uint8Array) {
        const newBuffer = new Uint8Array(this.buffer.byteLength + data.byteLength);
        newBuffer.set(this.buffer);
        newBuffer.set(data, this.buffer.byteLength);
        this.buffer = newBuffer;
        this.bytesLeft += data.byteLength;
    }
    readBytes(numBytes: number) {
        if (this.buffer.length - this.offset < numBytes) return null;
        const res = this.buffer.subarray(this.offset, this.offset + numBytes);
        this.offset += numBytes;
        this.bytesLeft -= numBytes;
        return res;
    }
    eraseProcessedBytes() {
        const newBuffer = new Uint8Array(this.buffer.byteLength - this.offset);
        newBuffer.set(this.buffer.subarray(this.offset));
        this.buffer = newBuffer;
        this.offset = 0;
        this.bytesLeft = this.buffer.byteLength;
    }
}

export function roundDown(input: number, multiple: number) {
    return input - (input % multiple);
}
