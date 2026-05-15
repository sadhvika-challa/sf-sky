import { spots as sfSpots } from './spots';
import { austinSpots } from './austin-spots';
import { santaCruzSpots } from './santa-cruz-spots';
import type { Spot } from './spots';

export const allSpots: Spot[] = [...sfSpots, ...austinSpots, ...santaCruzSpots];
