import { spots as sfSpots } from './spots';
import { austinSpots } from './austin-spots';
import type { Spot } from './spots';

export const allSpots: Spot[] = [...sfSpots, ...austinSpots];
