import { PopupStatusType } from '@/application/types';
import { createContext, useContext } from 'react';

export interface PopupStatusContext {
  status: PopupStatusType;
  setStatus: (status: PopupStatusType) => void;
  statusMessage: string;
  setStatusMessage: (statusMessage: string) => void;
}

export const PopupStatusContext = createContext<PopupStatusContext | null>(null);

export const usePopupStatus = () => {
  const ctx = useContext(PopupStatusContext);
  if (!ctx) throw new Error('usePopupStatus must be used within a PopupStatusProvider');
  return ctx;
};
