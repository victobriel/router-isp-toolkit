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

/** Login form selectors for Router base class (password may include fallbacks). */
export const ZteH199LoginSelectors = {
  username: ZteH199Selectors.username,
  password: '#Frm_Password, input[name="Frm_Password"], input[type="password"]',
} as const;
