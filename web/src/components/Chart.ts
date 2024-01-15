import { clearTimestampHandlers, getData, installTimestampHandler } from '../services/API';
import { select } from 'd3-selection';
import { scaleBand, scaleLinear, scaleTime } from 'd3-scale';
import { max } from 'd3-array';
import { axisBottom, axisLeft } from 'd3-axis';
import { roundDown } from '../../../common/utils';
import { BAR_WIDTH, REQUEST_TYPE } from '../common/constants';
import { CHART_TIME_RANGE } from '../constants';

type Bar = { time: number; value: number };

// setup chart dimensions
const svg = select('#chartData');
const svgWidth = (svg.node() as HTMLElement).getBoundingClientRect().width;
const svgHeight = (svg.node() as HTMLElement).getBoundingClientRect().height;

const barAreaMargin = { top: 0, right: 0, bottom: 40, left: 20 };
const barAreaWidth = svgWidth - barAreaMargin.left - barAreaMargin.right;
const barAreaHeight = svgHeight - barAreaMargin.top - barAreaMargin.bottom;

// create initial chart; bar chart of minimum bar width
const now = roundDown(Date.now(), Number(Object.values(BAR_WIDTH)[1]));
const start = now - CHART_TIME_RANGE[BAR_WIDTH.LINE];
const end = now;
createBarChart(REQUEST_TYPE.LIVE, BAR_WIDTH.BAR_5m, start, end);

async function createBarChart(type: REQUEST_TYPE, barWidth: BAR_WIDTH, start: number, end: number) {
    const barValues = await getData(type, barWidth, start, end);
    const rawBars = formatBarValues(start, barWidth, barValues);
    const bars = padBars(start, end, barWidth, rawBars);
    clearTimestampHandlers();
    if (type == REQUEST_TYPE.LIVE) {
        installTimestampHandler(function incorporateTimestampIntoBarChart(timestamp: number) {
            const timestampBar = roundDown(timestamp, barWidth);
            if (timestamp - end < barWidth) {
                bars[(timestampBar - start) / barWidth].value++;
            } else {
                const barDiff = Math.floor((timestamp - end) / barWidth);
                for (let i = 0; i < barDiff - 1; i++) {
                    bars.shift();
                    bars.push({ time: timestampBar - (barDiff - i) * barWidth, value: 0.3 });
                }
                bars.shift();
                bars.push({ time: timestampBar, value: 1 });
                start = start + barDiff * barWidth;
                end = timestampBar;
            }
            renderBarChart(start, end, barWidth, bars);
        });
    }
    renderBarChart(start, end, barWidth, bars);
}

function formatBarValues(start: number, barWidth: BAR_WIDTH, barValues: Uint32Array): Bar[] {
    const bars = [];
    barValues.forEach((value, i) => {
        bars.push({ time: start + i * barWidth, value });
    });
    return bars;
}

function padBars(start: number, end: number, barWidth: BAR_WIDTH, bars: Bar[]) {
    const numBarsToAdd = (end - start) / barWidth - bars.length;
    for (let i = 0; i < numBarsToAdd; i++) {
        bars.push({ time: start + (bars.length + i) * barWidth, value: 0.1 });
    }
    return bars;
}

function renderBarChart(start: number, end: number, barWidth: BAR_WIDTH, bars: Bar[]) {
    // define scales
    const xTime = scaleTime()
        .domain([new Date(start), new Date(end + barWidth)])
        .range([0, barAreaWidth]);
    const xBand = scaleBand()
        .domain(bars.map((d: Bar) => String(d.time)))
        .range([0, barAreaWidth])
        .padding(0.25);
    const yScale = scaleLinear()
        .domain([0, max(bars, (d: Bar) => d.value)])
        .nice()
        .range([barAreaHeight, 0]);

    // render bars
    svg.selectAll('rect')
        .data(bars)
        .join(
            function (enter) {
                return enter
                    .append('rect')
                    .attr('x', (d: Bar) => barAreaMargin.left + xBand(String(d.time)))
                    .attr('y', (d: Bar) => barAreaMargin.top + yScale(d.value))
                    .attr('height', (d: Bar) => barAreaHeight - yScale(d.value))
                    .attr('width', xBand.bandwidth())
                    .attr('fill', 'cyan')
                    .attr('opacity', '0.9')
                    .attr('class', 'glow');
            },
            function (update) {
                return update
                    .attr('x', (d: Bar) => barAreaMargin.left + xBand(String(d.time)))
                    .attr('y', (d: Bar) => barAreaMargin.top + yScale(d.value))
                    .attr('height', (d: Bar) => barAreaHeight - yScale(d.value));
            },
            function (exit) {
                return exit.remove();
            },
        );

    // add x-axis
    svg.select('.x-axis').selectAll('*').remove();
    const xAxis = axisBottom(xTime)
        .tickFormat((date: Date) => {
            // format hours and minutes with leading zeros
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
        .attr(
            'transform',
            `translate(${barAreaMargin.left}, ${barAreaHeight + barAreaMargin.top + axisBottomPaddingTop})`,
        );
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
        .attr('transform', `translate(${barAreaMargin.left}, ${barAreaMargin.top + axisBottomPaddingTop})`);
}
