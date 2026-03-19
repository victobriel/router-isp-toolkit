/**
 * CSS selectors for the ZTE ZXHN H3601 router admin UI.
 *
 * For now, H199 and H3601 share an identical selector set. Keep this module as
 * a per-model wrapper so drivers can override only the differences.
 */
import { ZteCommonSelectors } from '@/infra/drivers/zte/ZteCommonSelectors';

export const ZteH3601Selectors = {
  ...ZteCommonSelectors,
} as const;

/** Login form selectors for Router base class (password may include fallbacks). */
export const ZteH3601LoginSelectors = {
  username: ZteH3601Selectors.username,
  password: '#Frm_Password, input[name="Frm_Password"], input[type="password"]',
} as const;
