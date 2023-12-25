const PROTOCOL = import.meta.env.VITE_PROTOCOL;
const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_HOST_PORT;

export async function getData(start: number, end: number) {
    const res = await fetch(`${PROTOCOL}://${HOST}:${PORT}/data?s=${start}&e=${end}`);
    const bin = await res.arrayBuffer();
    return bin;
}

export async function getStream(start: number) {
    const sse = new EventSource(`${PROTOCOL}://${HOST}:${PORT}/stream?s=${start}`);
    return sse;
}
