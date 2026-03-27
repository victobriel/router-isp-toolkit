/**
 * CSS selectors for the ZTE ZXHN H199 router admin UI.
 *
 * For now, H199 and H3601 share an identical selector set. Keep this module as
 * a per-model wrapper so drivers can override only the differences.
 */
import { ZteCommonSelectors } from '@/infra/drivers/zte/ZteCommonSelectors';

export const ZteH199Selectors = {
  ...ZteCommonSelectors,
} as const;
