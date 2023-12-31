import http from 'http';

const CLIENT_API_KEY = process.env.CLIENT_API_KEY;

export function authenticateRequest(req: http.IncomingMessage) {
    const cookies = parseCookies(req);
    return cookies && cookies.apiKey === CLIENT_API_KEY;
}

function parseCookies(req: http.IncomingMessage) {
    const cookies: { [key: string]: string } = {};
    const cookieHeader = req.headers.cookie;
    cookieHeader &&
        cookieHeader.split(';').forEach(function addCookie(cookie) {
            const [name, value] = cookie.split('=');
            cookies[name.trim()] = decodeURI(value);
        });
    return cookies;
}

// async function readBytes(fileHandle: fs.promises.FileHandle, offset: number, numBytes: number): Promise<number> {
//     const buffer = Buffer.alloc(numBytes);
//     const { bytesRead } = await fileHandle.read(buffer, 0, numBytes, offset);
//     if (bytesRead != numBytes) throw new Error(`expected ${numBytes} bytes, got ${bytesRead}`);
//     if (numBytes == 4) return buffer.readUInt32LE(0);
//     if (numBytes == 8) return Number(buffer.readBigUInt64LE(0));
// }

// async function readMinute(minute: number): Promise<number> {
//     const offset = ((minute - firstMinute) / 60 / 1000) * 4;
//     const buffer = Buffer.alloc(4);
//     const { bytesRead } = await minutesFileHandle.read(buffer, 0, 4, offset);
//     if (bytesRead != 4) throw new Error(`expected 4 bytes, got ${bytesRead}`);
//     return buffer.readUInt32LE(0);
// }

// app.get('/data', (req, res) => {
//     res.type('application/octet-stream');
//     const start = ((roundDownToMinute(parseInt(req.query.s as string)) - firstMinute) / 60 / 1000) * 4;
//     const end = ((roundDownToMinute(parseInt(req.query.e as string)) - firstMinute) / 60 / 1000) * 4 + 3;
//     const minutesReadStream = fs.createReadStream('./minutes.bin', { start, end });
//     minutesReadStream.pipe(res);
//     console.log('received request: ', start, end);
// });

// app.get('/stream', async (req, res) => {
//     const startMinute = parseInt(req.query.s as string);
//     res.writeHead(200, {
//         'Content-Type': 'text/event-stream',
//         'Cache-Control': 'no-cache',
//         Connection: 'keep-alive',
//     });
//     const minDiff = (startMinute - prevMinute) / (60 * 1000);
//     if (prevMinute >= startMinute) {
//         const startMinuteTimestampOffset = await readMinute(startMinute);
//         const minuteFd = fs.openSync('./minutes.bin', 'r');
//         const timestampFd = fs.openSync('./timestamps.bin', 'r');
//         const timestampsBuffer = Buffer.alloc(timestampFileoffset - startMinuteTimestampOffset);
//         let bytesRead = fs.readSync(
//             timestampFd,
//             timestampsBuffer,
//             0,
//             timestampsBuffer.length,
//             startMinuteTimestampOffset,
//         );
//         if (bytesRead != timestampsBuffer.length)
//             throw new Error(`expected ${timestampsBuffer.length} bytes, got ${bytesRead}`);
//         fs.closeSync(timestampFd);
//         for (let i = 0; i < timestampsBuffer.length; i += TIMESTAMP_SIZE) {
//             const timestamp = timestampsBuffer.readBigUInt64LE(i);
//             res.write(`data: ${timestamp.toString()}\n\n`);
//         }
//     }
//     res.write(`event: latestCount\ndata: ${latestCount}\n\n`);
//     streamRes = res;
// });
