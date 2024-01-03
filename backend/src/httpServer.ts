import http from 'http';
import { authenticateRequest } from './utils.js';
import wss from './wss.js';
import app from './app.js';

const FRONTEND_PORT = process.env.FRONTEND_PORT;

const server = http.createServer();

server.on('upgrade', (req, socket, head) => {
    if (!authenticateRequest(req)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }

    wss.handleUpgrade(req, socket, head, ws => {
        wss.emit('connection', ws, req);
    });
});

server.on('request', app);

server.listen(FRONTEND_PORT);
