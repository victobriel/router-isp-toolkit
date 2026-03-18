import { PopupStatusType } from '@/application/types';
import { useState } from 'react';
import { PopupStatusContext } from '@/ui/popup/contexts/popup-status-context';

export const PopupStatusProvider = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<PopupStatusType>(PopupStatusType.NONE);
  const [statusMessage, setStatusMessage] = useState<string>('Ready.');

  return (
    <PopupStatusContext.Provider value={{ status, setStatus, statusMessage, setStatusMessage }}>
      {children}
    </PopupStatusContext.Provider>
  );
};
