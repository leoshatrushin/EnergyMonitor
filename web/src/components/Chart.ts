import { getData, getStream } from '../services/API';
import { select } from 'd3-selection';
import { scaleBand, scaleLinear } from 'd3-scale';
import { max } from 'd3-array';

type Bar = { time: number; value: number };

function roundDownToMinute(timestamp: number) {
    return timestamp - (timestamp % (60 * 1000));
}

function numBars(start: number, end: number, interval: number) {
    return Math.floor((end - start) / interval);
}

function convertBinToBars(bin: ArrayBuffer, start: number, end: number): Bar[] {
    const dataView = new DataView(bin);
    let barData = [];
    let prev = dataView.getUint32(0, true) / 8;
    for (let i = 4; i < bin.byteLength; i += 4) {
        const time = start + ((i - 1) / 4) * 60 * 1000;
        const rawValue = dataView.getUint32(i, true) / 8;
        const value = rawValue - prev;
        prev = rawValue;
        barData.push({ time, value });
    }
    const zeroBarsToAdd = numBars(start, end, 60 * 1000) - barData.length;
    for (let i = 0; i < zeroBarsToAdd; i++) {
        barData.push({ time: start + (barData.length + i) * 60 * 1000, value: 0.1 });
    }
    return barData;
}

const now = roundDownToMinute(Date.now());
let start = now - 15 * 60 * 1000;
let end = now;
const minutesBin = await getData(start, end);
const bars = convertBinToBars(minutesBin, start, end);

const svg = select('#chartData');
const xScale = scaleBand().range([0, 400]).padding(0.1);
const yScale = scaleLinear().range([0, 400]);

function updateData(data: Bar[]) {
    xScale.domain(bars.map((d: Bar) => String(d.time)));
    yScale.domain([0, max(bars, (d: Bar) => d.value) ?? 0]);
    svg.selectAll('rect')
        .data(data)
        .join(
            function(enter) {
                return enter
                    .append('rect')
                    .attr('x', (d: Bar) => xScale(String(d.time)) ?? 0)
                    .attr('y', (d: Bar) => 400 - yScale(d.value))
                    .attr('height', (d: Bar) => yScale(d.value))
                    .attr('width', xScale.bandwidth());
            },
            function(update) {
                return update
                    .attr('x', (d: Bar) => xScale(String(d.time)) ?? 0)
                    .attr('y', (d: Bar) => 400 - yScale(d.value))
                    .attr('height', (d: Bar) => yScale(d.value));
            },
            function(exit) {
                return exit.remove();
            },
        );
}

updateData(bars);

const sse = await getStream(now);
sse.onmessage = function incorporateTimestamp(e: MessageEvent) {
    const timestamp = parseInt(e.data);
    console.log(timestamp);
    const timestampMinute = roundDownToMinute(timestamp);
    if (timestamp - end < 60 * 1000) {
        bars[(timestampMinute - start) / 60 / 1000].value++;
    } else {
        const minDiff = Math.floor((timestamp - end) / 60 / 1000);
        for (let i = 0; i < minDiff - 1; i++) {
            bars.shift();
            bars.push({ time: timestampMinute - (minDiff - i) * 60 * 1000, value: 0.2 });
        }
        bars.shift();
        bars.push({ time: timestampMinute, value: 1 });
        start = start + minDiff * 60 * 1000;
        end = timestampMinute;
    }
    updateData(bars);
};
