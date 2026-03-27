import { PopupStatusType } from '@/application/types';
import { COPY_TEXT_VALUE_KEYS } from './constants';

export interface LogEntry {
  msg: string;
  type: PopupStatusType;
  time: string;
}

export type CopyTextValueKey = (typeof COPY_TEXT_VALUE_KEYS)[number]['key'];
