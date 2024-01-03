import express from 'express';
import { authenticateRequest } from './utils.js';

const WEB_ROOT_PATH = process.env.WEB_ROOT_PATH;
const CLIENT_API_KEY = process.env.CLIENT_API_KEY;

const app = express();

app.post('/', (req, res) => {
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
});

app.use(function authenticate(req, res, next) {
    if (authenticateRequest(req)) next();
    else res.sendFile(WEB_ROOT_PATH + '/login.html');
});

app.use(express.static(WEB_ROOT_PATH));

export default app;
