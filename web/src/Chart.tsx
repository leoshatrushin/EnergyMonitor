import { useEffect, useMemo, useState } from 'react';
import BarChart from './BarChart';
import styles from './styles/Chart.module.css';

const barData = [
    { time: 0, value: 10 },
    { time: 1, value: 20 },
    { time: 2, value: 30 },
    { time: 3, value: 40 },
    { time: 4, value: 50 },
];
const start = 1672531200000;
const times = [
    { label: 'd', value: 24 * 60 * 60 * 1000 },
    { label: 'h', value: 60 * 60 * 1000 },
    { label: '15m', value: 15 * 60 * 1000 },
];

async function getBarData(start: number, end: number) {
    const res = await fetch(`http://localhost:4002/data?s=${start}&e=${end}`);
    const bin = await res.arrayBuffer();
    const dataView = new DataView(bin);
    let barData = [];
    let prev;
    for (let i = 0; i < bin.byteLength; i += 4) {
        const time = start + (i / 4) * 60 * 1000;
        const rawValue = dataView.getUint32(i, true);
        const value = prev ? rawValue - prev : 0;
        prev = rawValue;
        barData.push({ time, value });
    }
    return barData;
}

const Chart = () => {
    const [barData, setBarData] = useState([]);
    const [now, setNow] = useState(1672531200000 + 60 * 1000 * 5 * 60 * 24);
    const [start, setStart] = useState(now - times[times.length - 1].value);
    const [end, setEnd] = useState(now);
    useEffect(() => {
        (async () => {
            const barData = await getBarData(start, end);
            setBarData(barData);
            console.log(barData);
        })();
    }, [start, end]);
    return (
        <>
            <svg id="chartData" width="400" height="400">
                <BarChart data={barData} />
            </svg>

            <div className={styles.timescaleButtons}>
                {times.map(time => (
                    <button key={time.label} onClick={() => setStart(now - time.value)}>
                        {time.label}
                    </button>
                ))}
            </div>
        </>
    );
};

export default Chart;
