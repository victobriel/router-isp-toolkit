import { translator } from '@/infra/i18n/I18nService';
import { EXPECTED_ERRORS } from './constants';

export const translateAuthError = (msg: string | undefined): string => {
  if (!msg) return msg ?? '';

  if (msg.includes('Credentials are required for authentication')) {
    return translator.t('popup_error_save_missing_fields');
  }

  if (
    msg.includes('Authentication failed. Please verify your username and password and try again')
  ) {
    return translator.t('popup_error_auth_failed');
  }

  // Fallback: keep the original message (may be non-localized).
  return msg;
};

export const isExpectedNavigationError = (msg: string): boolean => {
  return EXPECTED_ERRORS.some((s) => msg.toLowerCase().includes(s));
};

export const boolMatch = (
  actual: boolean | undefined,
  expected: boolean | undefined,
): boolean | undefined => {
  if (expected === undefined || actual === undefined) return undefined;
  // Some older/incorrect stored values may use empty string for "unset".
  if ((expected as unknown) === '') return undefined;
  return actual === expected;
};

export const regexMatch = (
  actual: string | undefined,
  expected: string | undefined,
): boolean | undefined => {
  // Treat unset values as "no comparison" (stored as `undefined` or empty string).
  if (expected === undefined || actual === undefined) return undefined;
  if (expected.trim() === '') return undefined;
  return new RegExp(expected).test(actual);
};

export const textMatch = (
  actual: string | undefined,
  expected: string | undefined,
): boolean | undefined => {
  // Treat unset values as "no comparison" (stored as `undefined` or empty string).
  if (expected === undefined || actual === undefined) return undefined;
  if (expected === '') return undefined;
  return actual === expected;
};

export const arrayMatch = (
  actual: string | undefined,
  expected: string[] | undefined,
): boolean | undefined => {
  if (expected === undefined || actual === undefined) return undefined;
  if (expected.length === 0) return undefined;
  return expected.some((e) => e === actual);
};
