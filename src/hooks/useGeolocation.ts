// Compatibility exports for components that only consume the shared shape and
// distance helper. New product code must use useLocation so permission remains
// an explicit user action.
export type { UserLocation } from '../utils/geo';
export { getDistanceMiles } from '../utils/geo';
