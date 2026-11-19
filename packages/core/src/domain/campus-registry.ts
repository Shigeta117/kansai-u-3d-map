import { SENRIYAMA_CONFIG } from '../data/campuses/senriyama/config';
import type { CampusConfig, CampusId } from './types';

export const CAMPUS_REGISTRY: Record<CampusId, CampusConfig> = {
  senriyama: SENRIYAMA_CONFIG,
};

export function getCampusConfig(campusId: CampusId): CampusConfig {
  return CAMPUS_REGISTRY[campusId];
}

export function listCampuses(): CampusConfig[] {
  return Object.values(CAMPUS_REGISTRY);
}

