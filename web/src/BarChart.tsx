import { select } from 'd3-selection';
import { scaleBand, scaleLinear } from 'd3-scale';
import { extent, max } from 'd3-array';
import { useEffect } from 'react';

type Bar = { time: number; value: number };

interface BarChartProps {
    data: Bar[] | undefined;
}

function BarChart({ data }: BarChartProps) {
    useEffect(function initSSE() {
        const sse = new EventSource(`http://${process.env.HOST}:4000/stream`);
        sse.onmessage = function onmessage(e) {
            const timestamp = parseInt(e.data);
            console.log(timestamp);
        };
    }, []);
    useEffect(
        function renderChart() {
            if (!data) return;
            const svg = select('#chartData');
            const xScale = scaleBand().range([0, 400]).padding(0.1);
            const yScale = scaleLinear().range([0, 400]);
            const rects = svg.selectAll('rect').data(data);
            xScale.domain(data.map((d: Bar) => String(d.time)));
            yScale.domain([0, max(data, (d: Bar) => d.value) ?? 0]);

            // Enter selection
            rects
                .enter()
                .append('rect')
                .attr('x', (d: Bar) => xScale(String(d.time)) ?? 0)
                .attr('y', (d: Bar) => 400 - yScale(d.value))
                .attr('height', (d: Bar) => yScale(d.value))
                .attr('width', xScale.bandwidth());
        },
        [data],
    );
    return null;
}

export default BarChart;
