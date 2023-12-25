import { config } from 'dotenv';
import net from 'net';
import tls from 'tls';

config();

let client: tls.TLSSocket | net.Socket;
let connectedEvent = 'connect';
if (process.env.mode === 'production') {
    client = tls.connect(Number(process.env.SERVER_PORT), process.env.SERVER_HOSTNAME);
    connectedEvent = 'secureConnect';
} else {
    client = new net.Socket().connect(Number(process.env.SERVER_PORT), process.env.SERVER_HOSTNAME);
}

client.on(connectedEvent, () => {
    client.write(process.env.API_KEY);
    sendNextTimestamp();
});

const min = 333;
const max = 3000;
function sendNextTimestamp() {
    const dt = Math.floor(Math.random() * (max - min + 1)) + min;
    setTimeout(() => {
        const now = Date.now();
        console.log(now);
        const buffer = Buffer.alloc(8);
        buffer.writeBigUInt64LE(BigInt(now));
        client.write(buffer);
        sendNextTimestamp();
    }, dt);
}
