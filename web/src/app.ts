import './components/Chart.ts';
import { BAR_WIDTH } from './common/constants.js';

const buttonLabels: { [key in BAR_WIDTH]: string } = {
    [BAR_WIDTH.LINE]: '10m',
    [BAR_WIDTH.BAR_1m]: '1h',
};

const chartPicker = document.getElementById('chartPicker');
for (const barWidth in BAR_WIDTH) {
    const button = document.createElement('button');
    button.innerText = buttonLabels[barWidth];
    button.addEventListener('click', () => {});
    chartPicker.appendChild(button);
}
