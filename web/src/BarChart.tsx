import { select } from 'd3-selection';
import { scaleBand, scaleLinear } from 'd3-scale';
import { extent, max } from 'd3-array';
import { useEffect } from 'react';


type Bar = {time: number, value: number};

interface BarChartProps {
    data: Bar[];
};

function BarChart({data}: BarChartProps) {
    let svg, rects, xScale, yScale;
    useEffect(function initializeD3() {
        svg = select('#chartData');
        rects = svg.selectAll('rect').data(data);
        xScale = scaleBand()
            .range([0, 120])
            .padding(0.1);

        yScale = scaleLinear()
            .range([0, 400]);
    }, []);
    useEffect(function renderChart() {
        rects.data(data);
        xScale.domain(data.map((d: Bar) => String(d.time)));
        yScale.domain([0, max(data, (d: Bar) => d.value) ?? 0]);

        // Enter selection
        rects.enter().append('rect')
            .attr('x', (d: Bar) => xScale(String(d.time)) ?? 0)
            .attr('y', (d: Bar) => 400 - yScale(d.value))
            .attr('height', (d: Bar) => yScale(d.value))
            .attr('width', 20);
    }, [data]);
    return null;
};

export default BarChart;
