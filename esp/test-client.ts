import { config } from 'dotenv';
import net from 'net';
import tls from 'tls';
import { to2020Date } from '../common/utils';

config();

let client: tls.TLSSocket | net.Socket;
let connectedEvent = 'connect';
if (process.env.mode === 'production') {
    client = tls.connect(Number(process.env.SERVER_PORT), process.env.SERVER_HOSTNAME);
    connectedEvent = 'secureConnect';
} else {
    client = new net.Socket().connect(Number(process.env.SERVER_PORT), process.env.SERVER_HOSTNAME);
}

let now = to2020Date(Date.now());
console.log(now);
console.log(Date.now());

client.on(connectedEvent, () => {
    client.write(process.env.API_KEY);
    if (process.argv[2]) {
        console.log(`Sending ${process.argv[2]} seconds worth of timestamps`);
        now -= Number(process.argv[2]) * 1000;
        while (now < to2020Date(Date.now())) {
            now += sendTimestamp(false);
        }
    }
    timeout();
});

const min = 333;
const max = 3000;
function sendTimestamp(log: boolean = true) {
    const dt = Math.floor(Math.random() * (max - min + 1)) + min;
    if (log) console.log(now + dt);
    const buffer = Buffer.alloc(4);
    buffer.writeUint32LE(now + dt);
    client.write(buffer);
    return dt;
}

function timeout() {
    const dt = sendTimestamp();
    now += dt;
    setTimeout(() => {
        timeout();
    }, dt);
}
