import BarChart from './BarChart';

const barData = [
    {time: 0, value: 10},
    {time: 1, value: 20},
    {time: 2, value: 30},
    {time: 3, value: 40},
    {time: 4, value: 50},
]

const Chart = () => {
    return (
        <>
            <svg id="chartData" width="400" height="400">
                <BarChart data={barData}/>
            </svg>
        </>
    );
};

export default Chart;
