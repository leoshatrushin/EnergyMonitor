import { StreamReader } from '../src/common/utils';

const helloWorld = 'hello world';

const decoder = new TextDecoder();

describe('streamreader', () => {
    it('should correctly read back input data', () => {
        const streamReader = new StreamReader();
        streamReader.readInto(Buffer.from(helloWorld));

        const result = streamReader.readBytes(helloWorld.length);
        expect(decoder.decode(result)).toEqual(helloWorld);
    });

    it('should correctly read back input data in chunks', () => {
        const streamReader = new StreamReader();
        streamReader.readInto(Buffer.from(helloWorld));

        const result = streamReader.readBytes(5);
        expect(decoder.decode(result)).toEqual('hello');

        const result2 = streamReader.readBytes(6);
        expect(decoder.decode(result2)).toEqual(' world');
    });

    it("shouldn't break when erasing processed bytes", () => {
        const streamReader = new StreamReader();
        streamReader.readInto(Buffer.from(helloWorld));

        const result = streamReader.readBytes(5);
        expect(decoder.decode(result)).toEqual('hello');

        streamReader.eraseProcessedBytes();

        const result2 = streamReader.readBytes(6);
        expect(decoder.decode(result2)).toEqual(' world');
    });

    it('should correctly concatenate data', () => {
        const streamReader = new StreamReader();
        streamReader.readInto(Buffer.from(helloWorld));
        streamReader.readInto(Buffer.from(' star'));

        const result = streamReader.readBytes(helloWorld.length + 5);
        expect(decoder.decode(result)).toEqual('hello world star');
    });

    it('should correctly work with initial data', () => {
        const streamReader = new StreamReader(Buffer.from('hello world'));

        const result = streamReader.readBytes(helloWorld.length);
        expect(decoder.decode(result)).toEqual(helloWorld);
    });

    it('should correctly work with initial data and concatenated data', () => {
        const streamReader = new StreamReader(Buffer.from('hello world'));
        streamReader.readInto(Buffer.from(' star'));

        const result = streamReader.readBytes(helloWorld.length + 5);
        expect(decoder.decode(result)).toEqual('hello world star');
    });
});
