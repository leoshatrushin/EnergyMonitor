import { createRoot } from 'react-dom/client';
import Chart from './Chart';

const App = () => {
    return (
        <div>
            <h1>Energy Monitor!</h1>
            <Chart />
        </div>
    );
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
