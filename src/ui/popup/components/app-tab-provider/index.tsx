import { ROUTER_MODEL_STORAGE_KEY } from '@/application/constants';
import { SessionStorageService } from '@/infra/storage/SessionStorageService';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/ui/components/ui/empty';
import { Router } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface AppTabProviderProps {
  children: (props: { tabId: number; routerModel: string }) => React.ReactNode;
}

export const AppTabProvider = ({ children }: AppTabProviderProps) => {
  const [tabId, setTabId] = useState<number | null>(null);
  const [routerModel, setRouterModel] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const id = tab?.id ?? null;
      setTabId(id);
      if (id !== null) {
        const model = await SessionStorageService.get<string>(
          `${ROUTER_MODEL_STORAGE_KEY}:${String(id)}`,
        );
        const detectedModel = typeof model === 'string' && model.trim() !== '' ? model : null;
        setRouterModel(detectedModel);
      }
    })();
  }, []);

  if (tabId === null || routerModel === null) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Router />
          </EmptyMedia>
          <EmptyTitle>No supported router detected</EmptyTitle>
          <EmptyDescription>
            Navigate to a supported router admin page and reload this popup.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return children({ tabId, routerModel });
};
