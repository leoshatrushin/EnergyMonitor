import { getData, getStream } from '../services/API';
import { select } from 'd3-selection';
import { scaleBand, scaleLinear, scaleTime } from 'd3-scale';
import { max } from 'd3-array';
import { axisBottom, axisLeft } from 'd3-axis';

type Bar = { time: number; value: number };

function roundDownToMinute(timestamp: number) {
    return timestamp - (timestamp % (60 * 1000));
}

function numBars(start: number, end: number, interval: number) {
    return Math.floor((end - start) / interval) + 1;
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
let start = now - 14 * 60 * 1000;
let end = now;
const minutesBin = await getData(start, end);
const bars = convertBinToBars(minutesBin, start, end);
const svgElement = document.getElementById('chartData');
let svWidth = svgElement.getAttribute('width');
let svgHeight = svgElement.getAttribute('height');

const svg = select('#chartData');

function updateData(data: Bar[]) {
    const xTime = scaleTime().range([40, 440]);
    const xBand = scaleBand().range([40, 440]).padding(0.1);
    const yScale = scaleLinear().range([420, 20]);
    xTime.domain([new Date(start), new Date(end + 60 * 1000)]);
    xBand.domain(bars.map((d: Bar) => String(d.time)));
    yScale.domain([0, max(bars, (d: Bar) => d.value) ?? 0]);
    svg.selectAll('rect')
        .data(data)
        .join(
            function (enter) {
                return enter
                    .append('rect')
                    .attr('x', (d: Bar) => xBand(String(d.time)) ?? 0)
                    .attr('y', (d: Bar) => yScale(d.value))
                    .attr('height', (d: Bar) => 420 - yScale(d.value))
                    .attr('width', xBand.bandwidth())
                    .attr('fill', 'cyan')
                    .attr('opacity', '0.8')
                    .attr('class', 'glow');
            },
            function (update) {
                return update
                    .attr('x', (d: Bar) => xBand(String(d.time)) ?? 0)
                    .attr('y', (d: Bar) => yScale(d.value))
                    .attr('height', (d: Bar) => 420 - yScale(d.value));
            },
            function (exit) {
                return exit.remove();
            },
        );
    svg.select('.x-axis').remove();
    const xAxis = axisBottom(xTime)
        .tickFormat((date: Date) => {
            // Format hours and minutes with leading zeros if needed
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        })
        .ticks(5)
        .tickSizeOuter(0);
    svg.append('g').attr('class', 'x-axis').attr('transform', `translate(0,422)`).call(xAxis);
    svg.select('.y-axis').remove();
    const yAxis = axisLeft(yScale)
        .ticks(5)
        .tickFormat(d => {
            return `${Number(d)}KW`;
        })
        .tickSizeOuter(0);
    svg.append('g').attr('class', 'y-axis').attr('transform', `translate(40,2)`).call(yAxis);
}

updateData(bars);

const sse = await getStream(now);
sse.onmessage = function incorporateTimestamp(e: MessageEvent) {
    const timestamp = parseInt(e.data);
    console.log(timestamp);
    const timestampMinute = roundDownToMinute(timestamp);
    if (timestamp - end < 60 * 1000) {
        console.log('adding');
        bars[(timestampMinute - start) / 60 / 1000].value++;
    } else {
        console.log('new minute');
        const minDiff = Math.floor((timestamp - end) / 60 / 1000);
        for (let i = 0; i < minDiff - 1; i++) {
            bars.shift();
            bars.push({ time: timestampMinute - (minDiff - i) * 60 * 1000, value: 0.3 });
        }
        bars.shift();
        bars.push({ time: timestampMinute, value: 1 });
        start = start + minDiff * 60 * 1000;
        end = timestampMinute;
    }
    updateData(bars);
};
