import { BAR_WIDTH, HOUR, MINUTE } from './common/constants';

export const CHART_TIME_RANGE: { [key in BAR_WIDTH]: number } = {
    [BAR_WIDTH.LINE]: 10 * MINUTE,
    [BAR_WIDTH.BAR_1m]: HOUR,
};
