export type { ExtractionResult, PingTestResult } from '@/domain/schemas/validation';
export type { CredentialBookmark, ModelBookmarks } from '@/application/types';

export enum Band {
  GHz24 = '24gHz',
  GHz5 = '5gHz',
}

export enum DiagnosticsMode {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
}
