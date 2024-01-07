import { getData, installTimestampHandler } from '../services/API';
import { select } from 'd3-selection';
import { scaleBand, scaleLinear, scaleTime } from 'd3-scale';
import { max } from 'd3-array';
import { axisBottom, axisLeft } from 'd3-axis';
import { roundDown } from '../../../common/utils';
import { MINUTE, TIMESTAMP_SIZE, FILE_OFFSET_SIZE } from '../common/constants';

type Bar = { time: number; value: number };

function numBars(start: number, end: number, interval: number) {
    return Math.floor((end - start) / interval) + 1;
}

function convertBinToBars(bin: ArrayBuffer, start: number, end: number): Bar[] {
    const dataView = new DataView(bin);
    let barData = [];
    let prev: number;
    if (bin.byteLength >= 4) {
        prev = dataView.getUint32(0, true) / TIMESTAMP_SIZE;
    }
    for (let i = FILE_OFFSET_SIZE; i < bin.byteLength; i += FILE_OFFSET_SIZE) {
        const time = start + ((i - 1) / FILE_OFFSET_SIZE) * MINUTE;
        const rawValue = dataView.getUint32(i, true) / TIMESTAMP_SIZE;
        const value = rawValue - prev;
        prev = rawValue;
        barData.push({ time, value });
    }
    const zeroBarsToAdd = numBars(start, end, MINUTE) - barData.length;
    for (let i = 0; i < zeroBarsToAdd; i++) {
        barData.push({ time: start + (barData.length + i) * MINUTE, value: 0.1 });
    }
    return barData;
}

const svg = select('#chartData');
const svgWidth = (svg.node() as HTMLElement).getBoundingClientRect().width;
const svgHeight = (svg.node() as HTMLElement).getBoundingClientRect().height;
const barsMargin = { top: 0, right: 0, bottom: 40, left: 20 };
const barsWidth = svgWidth - barsMargin.left - barsMargin.right;
const barsHeight = svgHeight - barsMargin.top - barsMargin.bottom;

const now = roundDown(Date.now(), MINUTE);
let start = now - 14 * MINUTE;
let end = now;

const minutesBin = await getData(start, end);
const bars = convertBinToBars(minutesBin, start, end);

function updateData(data: Bar[]) {
    const xTime = scaleTime()
        .domain([new Date(start), new Date(end + MINUTE)])
        .range([0, barsWidth]);
    const xBand = scaleBand()
        .domain(bars.map((d: Bar) => String(d.time)))
        .range([0, barsWidth])
        .padding(0.25);
    const yScale = scaleLinear()
        .domain([0, max(bars, (d: Bar) => d.value)])
        .nice()
        .range([barsHeight, 0]);

    svg.selectAll('rect')
        .data(data)
        .join(
            function (enter) {
                return enter
                    .append('rect')
                    .attr('x', (d: Bar) => barsMargin.left + xBand(String(d.time)))
                    .attr('y', (d: Bar) => barsMargin.top + yScale(d.value))
                    .attr('height', (d: Bar) => barsHeight - yScale(d.value))
                    .attr('width', xBand.bandwidth())
                    .attr('fill', 'cyan')
                    .attr('opacity', '0.9')
                    .attr('class', 'glow');
            },
            function (update) {
                return update
                    .attr('x', (d: Bar) => barsMargin.left + xBand(String(d.time)))
                    .attr('y', (d: Bar) => barsMargin.top + yScale(d.value))
                    .attr('height', (d: Bar) => barsHeight - yScale(d.value));
            },
            function (exit) {
                return exit.remove();
            },
        );

    // add x-axis
    svg.select('.x-axis').selectAll('*').remove();
    const xAxis = axisBottom(xTime)
        .tickFormat((date: Date) => {
            // Format hours and minutes with leading zeros if needed
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        })
        .ticks(5)
        .tickSizeOuter(0);
    const axisBottomPaddingTop = 2;
    svg.select('g.axisBottom')
        // @ts-ignore
        .call(xAxis)
        .attr('transform', `translate(${barsMargin.left}, ${barsHeight + barsMargin.top + axisBottomPaddingTop})`);
    // .selectAll('text')
    // .attr('transform', 'translate(-10,10)rotate(-45)');

    // add y-axis
    svg.select('.axisLeft').selectAll('*').remove();
    const yAxis = axisLeft(yScale)
        .ticks(5)
        .tickFormat(d => {
            return `${Number(d)}`;
        })
        .tickSizeOuter(0)
        .tickSizeInner(-svgWidth);
    svg.select('g.axisLeft')
        // @ts-ignore
        .call(yAxis)
        .attr('transform', `translate(${barsMargin.left}, ${barsMargin.top + axisBottomPaddingTop})`);
}

updateData(bars);

installTimestampHandler(function incorporateTimestamp(timestamp: number) {
    const timestampMinute = roundDown(timestamp, MINUTE);
    if (timestamp - end < MINUTE) {
        console.log('adding');
        bars[(timestampMinute - start) / MINUTE].value++;
    } else {
        console.log('new minute');
        const minDiff = Math.floor((timestamp - end) / MINUTE);
        for (let i = 0; i < minDiff - 1; i++) {
            bars.shift();
            bars.push({ time: timestampMinute - (minDiff - i) * MINUTE, value: 0.3 });
        }
        bars.shift();
        bars.push({ time: timestampMinute, value: 1 });
        start = start + minDiff * MINUTE;
        end = timestampMinute;
    }
    updateData(bars);
});
