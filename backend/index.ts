import { config } from 'dotenv';
import net from 'net';
import http from 'http';
import fs from 'fs';
import express from 'express';

config();
const SENSOR_API_KEY = process.env.SENSOR_API_KEY;
const CLIENT_API_KEY = process.env.CLIENT_API_KEY;
const WEB_ROOT_PATH = process.env.WEB_ROOT_PATH;

const TIMESTAMP_SIZE = 4;

let sensorAuthenticated = false;
let stateInitialized: Promise<void>;
let timestampStream: fs.WriteStream, minutesWriteStream: fs.WriteStream;
let timestampFileoffset: number;
let firstMinute,
    prevMinute: number = 0;
let minuteFd: fs.promises.FileHandle;
let streamRes: http.ServerResponse;
async function initializeState() {
    // const timestampFd = await fs.promises.open('timestamps', 'r');
    // const stat = await timestampFd.stat();
    // timestampFileoffset = stat.size;
    // try {
    //     prevMinute = await readInt(timestampFd.fd, timestampFileoffset - TIMESTAMP_SIZE) % (60 * 1000);
    // }
    // timestampStream = fs.createWriteStream('timestamps', { flags: 'a' });
    minuteFd = await fs.promises.open('minutes.bin', 'r');
    const minuteStat = await minuteFd.stat();
    prevMinute = firstMinute + (minuteStat.size / 4 - 1) * 60 * 1000;
    // if (minuteStat.size > 0) {
    //     try {
    //         firstMinute = await readInt(minuteFd.fd, 0);
    //     } catch (err) {
    //         console.log(err);
    //     }
    // }
    minutesWriteStream = fs.createWriteStream('minutes.bin', { flags: 'a' });
}
firstMinute = 1672531200000;

function readInt(fd: number, offset: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const buffer = Buffer.alloc(4);
        fs.read(fd, buffer, 0, 4, offset, (err, bytesRead, buffer) => {
            if (err) {
                reject(err);
            } else {
                resolve(buffer.readUInt32LE(0));
            }
        });
    });
}

const tcpServer = net.createServer(socket => {
    let apiKey = '';
    socket.on('data', async data => {
        if (!sensorAuthenticated) {
            const toRead = Math.min(data.length, SENSOR_API_KEY.length - apiKey.length);
            apiKey += data.toString().slice(0, toRead);
            data = data.subarray(toRead);
            console.log(apiKey);
            if (apiKey.length < SENSOR_API_KEY.length) return;
            if (apiKey === SENSOR_API_KEY) {
                sensorAuthenticated = true;
                console.log('sensor authenticated');
                stateInitialized = initializeState();
            } else {
                socket.destroy();
            }
            if (data.length === 0) return;
        }

        await stateInitialized;
        // timestampStream.write(data);
        const timestamp = data.readUInt32LE(0);
        const minutesDiff = (timestamp - prevMinute) % (60 * 1000);
        const buffer = Buffer.alloc(4);
        buffer.writeUInt32LE(timestampFileoffset);
        for (let i = 0; i < minutesDiff; i++) {
            minutesWriteStream.write(buffer);
        }
        timestampFileoffset += TIMESTAMP_SIZE;

        console.log(timestamp);
        if (streamRes) {
            console.log('streamRes exists');
            streamRes.write('data: 6\n\n');
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
    const end = ((roundDownToMinute(parseInt(req.query.e as string)) - firstMinute) / 60 / 1000) * 4 - 1;
    const minutesReadStream = fs.createReadStream('./minutes.bin', { start, end });
    console.log(start, end);
    minutesReadStream.pipe(res);
});

app.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    streamRes = res;
    streamRes.write('data: 5\n\n');
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
