import { ROUTER_MODEL_STORAGE_KEY } from '@/application/constants';
import { services } from '@/index';
import { Button } from '@/ui/components/ui/button';
import { translator } from '@/infra/i18n/I18nService';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/ui/components/ui/empty';
import { Router, Settings } from 'lucide-react';
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
        const model = await services.sessionStorage.get<string>(
          `${ROUTER_MODEL_STORAGE_KEY}:${String(id)}`,
        );
        const detectedModel = typeof model === 'string' && model.trim() !== '' ? model : null;
        setRouterModel(detectedModel);
      }
    })();
  }, []);

  const handleOpenSettings = () => {
    void chrome.runtime.openOptionsPage();
  };

  if (tabId === null || routerModel === null) {
    return (
      <div className="flex flex-col h-screen items-center p-4">
        <Button variant="link" onClick={handleOpenSettings}>
          <Settings className="size-4" />
          <span className="text-sm">{translator.t('popup_go_to_settings')}</span>
        </Button>
        <div className="flex items-center justify-center flex-1 bg-background text-foreground text-sm">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Router />
              </EmptyMedia>
              <EmptyTitle>{translator.t('popup_no_supported_router_title')}</EmptyTitle>
              <EmptyDescription>{translator.t('popup_no_supported_router_desc')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  return children({ tabId, routerModel });
};
