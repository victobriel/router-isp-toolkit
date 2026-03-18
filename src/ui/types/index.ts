export { PopupStatusType as StatusType } from '@/application/types';
export type { ExtractionResult, PingTestResult } from '@/domain/schemas/validation';
export type { CredentialBookmark, ModelBookmarks } from '@/application/types';

import type { PopupStatusType } from '@/application/types';

export type PopupStatus = {
  type: PopupStatusType;
  message: string;
};

export enum Band {
  GHz24 = '2.4 GHz',
  GHz5 = '5 GHz',
}
