import { config } from 'dotenv';
import net from 'net';
import http from 'http';
import fs from 'fs';

config();
const SENSOR_API_KEY = process.env.SENSOR_API_KEY;
const CLIENT_API_KEY = process.env.CLIENT_API_KEY;
const WEB_ROOT_PATH = process.env.WEB_ROOT_PATH;

const TIMESTAMP_SIZE = 4;

let sensorAuthenticated = false;
let stateInitialized: Promise<void>;
let timestampStream: fs.WriteStream, minuteStream: fs.WriteStream;
let timestampFileoffset: number;
let prevMinute: number = 0;
async function initializeState() {
    const timestampFd = await fs.promises.open('timestamps', 'r');
    const stat = await timestampFd.stat();
    timestampFileoffset = stat.size;
    if (timestampFileoffset > TIMESTAMP_SIZE) {
        const buffer = Buffer.alloc(TIMESTAMP_SIZE);
        await timestampFd.read(buffer, 0, TIMESTAMP_SIZE, timestampFileoffset - TIMESTAMP_SIZE);
        prevMinute = buffer.readUInt32LE(0) % (60 * 1000);
    }
    timestampStream = fs.createWriteStream('timestamps', { flags: 'a' });
    minuteStream = fs.createWriteStream('minutes', { flags: 'a' });
}

const tcpServer = net.createServer(socket => {
    socket.on('data', async data => {
        if (!sensorAuthenticated) {
            const apiKey = data.toString();
            if (apiKey === SENSOR_API_KEY) {
                sensorAuthenticated = true;
                stateInitialized = initializeState();
            } else {
                socket.destroy();
            }
            return;
        }

        await stateInitialized;
        timestampStream.write(data);
        const timestamp = data.readUInt32LE(0);
        const minutesDiff = (timestamp % (60 * 1000)) - prevMinute;
        const buffer = Buffer.alloc(4);
        buffer.writeUInt32LE(timestampFileoffset);
        for (let i = 0; i < minutesDiff; i++) {
            minuteStream.write(buffer);
        }
        timestampFileoffset += TIMESTAMP_SIZE;
    });
});

tcpServer.listen(4001);

const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET') {
        const cookies = parseCookies(req);
        console.log(cookies);
        if (cookies && cookies.apiKey === CLIENT_API_KEY) {
            console.log('serving client page');
            serveClientPage(res);
        } else {
            console.log('serving auth page');
            serveAuthPage(res);
        }
    } else if (req.method === 'POST') {
        handleAPIKeySubmission(req, res);
    }
});

httpServer.listen(4002);

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
            res.writeHead(302, { Location: '/' });
            res.end(JSON.stringify({ authenticated: true }));
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(401, { Location: '/' });
            res.end(JSON.stringify({ authenticated: false }));
        }
    });
}

async function serveAuthPage(res: http.ServerResponse) {
    const html = await fs.promises.readFile(WEB_ROOT_PATH + '/login.html');
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(html);
}

async function serveClientPage(res: http.ServerResponse) {
    const html = await fs.promises.readFile(WEB_ROOT_PATH + '/index.html');
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(html);
}
