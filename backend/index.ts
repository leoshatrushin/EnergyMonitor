import { config } from 'dotenv';
import net from 'net';
import http from 'http';
import fs from 'fs';
import express from 'express';

config();
const SENSOR_API_KEY = process.env.SENSOR_API_KEY;
const CLIENT_API_KEY = process.env.CLIENT_API_KEY;
const WEB_ROOT_PATH = process.env.WEB_ROOT_PATH;

const TIMESTAMP_SIZE = 8;

const timestampFileHandle = await fs.promises.open('timestamps.bin', 'r');
const timestampWriteStream = fs.createWriteStream('timestamps.bin', { flags: 'a' });
let timestampFileoffset = (await timestampFileHandle.stat()).size;
const minutesFileHandle = await fs.promises.open('minutes.bin', 'r');
const minutesWriteStream = fs.createWriteStream('minutes.bin', { flags: 'a' });
let firstMinute = 0;
let prevMinute = 0;
let sensorAuthenticated = false;
let streamRes: http.ServerResponse;
{
    const firstTimestamp = await readBytes(timestampFileHandle, 0, TIMESTAMP_SIZE);
    const prevTimestamp = await readBytes(timestampFileHandle, timestampFileoffset - TIMESTAMP_SIZE, TIMESTAMP_SIZE);
    firstMinute = roundDownToMinute(firstTimestamp);
    prevMinute = roundDownToMinute(prevTimestamp);
    timestampFileHandle.close();
}

async function readMinute(minute: number): Promise<number> {
    const offset = ((minute - firstMinute) / 60 / 1000) * 4;
    const buffer = Buffer.alloc(4);
    const { bytesRead } = await minutesFileHandle.read(buffer, 0, 4, offset);
    if (bytesRead != 4) throw new Error(`expected 4 bytes, got ${bytesRead}`);
    return buffer.readUInt32LE(0);
}

async function readBytes(fileHandle: fs.promises.FileHandle, offset: number, numBytes: number): Promise<number> {
    const buffer = Buffer.alloc(numBytes);
    const { bytesRead } = await fileHandle.read(buffer, 0, numBytes, offset);
    if (bytesRead != numBytes) throw new Error(`expected ${numBytes} bytes, got ${bytesRead}`);
    if (numBytes == 4) return buffer.readUInt32LE(0);
    if (numBytes == 8) return Number(buffer.readBigUInt64LE(0));
}

const tcpServer = net.createServer(socket => {
    let apiKey = '';
    // const buffer = Buffer.alloc(8);
    socket.on('data', async data => {
        if (!sensorAuthenticated) {
            const bytesToRead = Math.min(data.length, SENSOR_API_KEY.length - apiKey.length);
            apiKey += data.toString().slice(0, bytesToRead);
            data = data.subarray(bytesToRead);
            if (apiKey.length < SENSOR_API_KEY.length) return;
            if (apiKey === SENSOR_API_KEY) {
                sensorAuthenticated = true;
                console.log('sensor authenticated');
            } else {
                socket.destroy();
                console.log('sensor authentication failed');
            }
            if (data.length === 0) return;
        }

        // const bytesToRead = data.length;
        // while (bytesToRead > 7) {
        //     if (bytesToRead > 0 && bytesToRead < 8) {
        //         buffer.set(data.subarray(data.length - bytesToRead, bytesToRead));
        //         break;
        //     }
        // }

        timestampWriteStream.write(data);

        const timestamp = Number(data.readBigUInt64LE(0));
        const minutesDiff = Math.floor((timestamp - prevMinute) / (60 * 1000));
        const buffer = Buffer.alloc(4);
        buffer.writeUInt32LE(timestampFileoffset);
        for (let i = 0; i < minutesDiff; i++) {
            minutesWriteStream.write(buffer);
            prevMinute += 60 * 1000;
        }
        timestampFileoffset += TIMESTAMP_SIZE;
        console.log(timestamp);

        if (streamRes) {
            console.log('sending data to stream');
            streamRes.write(`data: ${timestamp.toString()}\n\n`);
        }
    });
});

tcpServer.listen(4001);

function roundDownToMinute(timestamp: number) {
    return timestamp - (timestamp % (60 * 1000));
}

const app = express();

app.use(function authenticate(req, res, next) {
    const cookies = parseCookies(req);
    if (cookies && cookies.apiKey === CLIENT_API_KEY) {
        next();
    } else {
        res.sendFile(WEB_ROOT_PATH + '/login.html');
    }
});

app.post('/', (req, res) => {
    handleAPIKeySubmission(req, res);
});

app.get('/data', (req, res) => {
    res.type('application/octet-stream');
    const start = ((roundDownToMinute(parseInt(req.query.s as string)) - firstMinute) / 60 / 1000) * 4;
    const end = ((roundDownToMinute(parseInt(req.query.e as string)) - firstMinute) / 60 / 1000) * 4 + 3;
    const minutesReadStream = fs.createReadStream('./minutes.bin', { start, end });
    minutesReadStream.pipe(res);
    console.log('received request: ', start, end);
});

app.get('/stream', async (req, res) => {
    const startMinute = parseInt(req.query.s as string);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    if (prevMinute >= startMinute) {
        const startMinuteTimestampOffset = await readMinute(startMinute);
        const timestampFd = fs.openSync('./timestamps.bin', 'r');
        const timestampsBuffer = Buffer.alloc(timestampFileoffset - startMinuteTimestampOffset);
        let bytesRead = fs.readSync(
            timestampFd,
            timestampsBuffer,
            0,
            timestampsBuffer.length,
            startMinuteTimestampOffset,
        );
        if (bytesRead != timestampsBuffer.length)
            throw new Error(`expected ${timestampsBuffer.length} bytes, got ${bytesRead}`);
        fs.closeSync(timestampFd);
        for (let i = 0; i < timestampsBuffer.length; i += TIMESTAMP_SIZE) {
            const timestamp = timestampsBuffer.readBigUInt64LE(i);
            res.write(`data: ${timestamp.toString()}\n\n`);
        }
    }
    streamRes = res;
});

app.use(express.static(WEB_ROOT_PATH));

app.listen(4002);

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

function handleAPIKeySubmission(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    req.on('end', async () => {
        console.log('post body: ', body);
        const { apiKey } = JSON.parse(body);
        if (apiKey === CLIENT_API_KEY) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Set-Cookie', `apiKey=${apiKey}; HttpOnly`);
            res.end(JSON.stringify({ authenticated: true }));
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(401, { Location: '/' });
            res.end(JSON.stringify({ authenticated: false }));
        }
    });
}
