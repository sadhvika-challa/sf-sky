import { spots as sfSpots } from './spots';
import { austinSpots } from './austin-spots';
import { santaCruzSpots } from './santa-cruz-spots';
import { sfHiddenGemSpots } from './sf-hidden-gems';
import type { Spot } from './spots';

export const allSpots: Spot[] = [...sfSpots, ...sfHiddenGemSpots, ...austinSpots, ...santaCruzSpots];
