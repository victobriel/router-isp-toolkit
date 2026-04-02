import { useEffect, useState } from 'react';
import { DiagnosticsMode } from '@/ui/types';
import { Button } from '@/ui/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/ui/components/ui/tabs';
import {
  Play,
  Router,
  Activity,
  DatabaseIcon,
  LucideIcon,
  Network,
  Settings,
  MoreVertical,
  Copy,
  RefreshCw,
  Trash,
  Power,
} from 'lucide-react';
import { PopupHeader } from '@/ui/modules/popup/components/popup-header';
import { PopupCredentials } from '@/ui/modules/popup/components/popup-credentials';
import { AppTabProvider } from '@/ui/modules/popup/components/app-tab-provider';
import { PopupDataProvider } from '@/ui/modules/popup/components/popup-data-provider';
import type { RouterPreferencesComparison } from '@/ui/modules/popup/types/router-data.types';
import { PopupStatus } from '@/ui/modules/popup/components/popup-status';
import { WanSection } from '@/ui/modules/popup/components/popup-data-sections/wan-section';
import { RemoteAccessSection } from '@/ui/modules/popup/components/popup-data-sections/remote-access-section';
import { WlanBandSection } from '@/ui/modules/popup/components/popup-data-sections/wlan-band-section';
import { Band, ExtractionResult, PingTestResult } from '@/ui/types';
import { TopologySection } from '@/ui/modules/popup/components/popup-data-sections/topology-section';
import { DhcpSection } from '@/ui/modules/popup/components/popup-data-sections/dhcp-section';
import { MiscSection } from '@/ui/modules/popup/components/popup-data-sections/misc-section';
import { PopupDiagnosticsTab } from '@/ui/modules/popup/components/popup-diagnostics-tab';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/ui/components/ui/empty';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/components/ui/dropdown-menu';
import { usePopupBookmark } from '@/ui/modules/popup/hooks/use-popup-bookmark';
import { GoToPageOptions, PopupStatusType, RouterPage, RouterPageKey } from '@/application/types';
import { PopupStatusProvider, usePopupStatus } from '@/ui/modules/popup/hooks/use-popup-status';
import { copyTextToClipboard } from '@/ui/lib/clipboard';
import { translator } from '@/infra/i18n/I18nService';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/ui/components/ui/tooltip';

function PopupContent({
  tabId,
  routerModel,
  data,
  isCollecting,
  isPinging,
  internalPingResult,
  externalPingResult,
  routerPreferencesComparison,
  onCollect,
  onPing,
  copyText,
  goToPage,
  onClear,
  rebootRouter,
  isRouterAuthenticated,
  lastAuthCredentials,
}: {
  tabId: number;
  routerModel: string;
  data: ExtractionResult | null;
  isCollecting: boolean;
  isPinging: boolean;
  internalPingResult: PingTestResult | null;
  externalPingResult: PingTestResult | null;
  routerPreferencesComparison: RouterPreferencesComparison | null;
  onCollect: (username: string, password: string) => Promise<void>;
  onClear: () => void;
  onPing: (ip: string, mode: DiagnosticsMode) => Promise<void>;
  copyText: () => Promise<{ data: string | null; error?: string }>;
  goToPage: (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => void;
  rebootRouter: () => Promise<void>;
  isRouterAuthenticated: boolean | null;
  lastAuthCredentials: { username: string; password: string } | null;
}) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [dropdownMenuOpen, setDropdownMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('data');

  const { setStatus, setStatusMessage } = usePopupStatus();

  const { bookmarks } = usePopupBookmark({
    routerModel,
  });

  useEffect(() => {
    if (bookmarks.length > 0) {
      setUsername(bookmarks[0].username);
      setPassword(bookmarks[0].password);
    }
  }, [bookmarks]);

  const handleCopyText = async () => {
    const { data: text, error } = await copyText();

    if (error) {
      setStatus(PopupStatusType.ERR);
      setStatusMessage(error);
      return;
    }

    if (!text) {
      setStatus(PopupStatusType.ERR);
      setStatusMessage(translator.t('popup_error_no_data_to_copy'));
      return;
    }

    const wasCopied = await copyTextToClipboard(text);
    if (!wasCopied) {
      setStatus(PopupStatusType.ERR);
      setStatusMessage(translator.t('popup_error_copy_to_clipboard'));
      return;
    }

    setStatus(PopupStatusType.OK);
    setStatusMessage(translator.t('popup_status_copy_success'));
  };

  const handleClearData = () => {
    void onClear();
    setStatus(PopupStatusType.OK);
    setStatusMessage(translator.t('popup_status_ready'));
  };

  const handleOpenSettings = () => {
    setDropdownMenuOpen(false);
    void chrome.runtime.openOptionsPage();
  };

  const menu: {
    label: string;
    value: string;
    type: 'tab' | 'button';
    icon?: LucideIcon;
    onClick?: () => void;
  }[] = [
    { label: translator.t('popup_tab_main'), value: 'data', type: 'tab', icon: DatabaseIcon },
    { label: translator.t('popup_tab_topology'), value: 'topology', type: 'tab', icon: Network },
    {
      label: translator.t('popup_tab_diagnostics'),
      value: 'diagnostics',
      type: 'tab',
      icon: Activity,
    },
    // { label: 'Logs', value: 'logs', type: 'tab', icon: Activity },
    {
      label: translator.t('popup_settings_aria_label'),
      value: 'settings',
      type: 'button',
      icon: Settings,
      onClick: handleOpenSettings,
    },
  ];

  const handleRebootRouter = () => {
    const shouldReboot = window.confirm(translator.t('popup_reboot_router_confirm_prompt'));
    if (!shouldReboot) return;

    setStatus(PopupStatusType.OK);
    setStatusMessage(translator.t('popup_status_ready'));
    void rebootRouter();
  };

  const secondaryMenu: {
    label: string;
    value: string;
    icon: LucideIcon;
    onClick?: () => void;
    disabled?: boolean;
  }[] = [
    {
      label: translator.t('popup_collect_refresh_button'),
      value: 'refresh',
      icon: RefreshCw,
      onClick: () => void onCollect(username, password),
      disabled: isCollecting,
    },
    {
      label: translator.t('popup_clear_aria_label'),
      value: 'clear',
      icon: Trash,
      onClick: handleClearData,
    },
    {
      label: translator.t('popup_reboot_router'),
      value: 'reboot',
      icon: Power,
      onClick: handleRebootRouter,
    },
  ];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground text-sm overflow-x-hidden">
      <PopupHeader routerModel={routerModel} />
      <PopupStatus />
      <PopupCredentials
        tabId={tabId}
        routerModel={routerModel}
        username={username}
        password={password}
        hasData={!!data}
        isRouterAuthenticated={isRouterAuthenticated}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        lastAuthCredentials={lastAuthCredentials}
        routerPreferencesComparison={routerPreferencesComparison}
      />

      {data && (
        <div className="flex gap-1.5 justify-between bg-background pb-2 px-2">
          <div className="flex gap-1.5">
            {secondaryMenu.map(({ label, value, icon: Icon, onClick, disabled }) => (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={onClick}
                    disabled={disabled}
                    className="group min-w-0"
                  >
                    <Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          <Button onClick={handleCopyText} className="min-w-0 h-full! shrink-0">
            <Copy className="size-4" />
            <span className="truncate">{translator.t('popup_copy_text')}</span>
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
        <TabsList className="shrink-0 gap-1.5 px-2 rounded-none! py-1 border-b border-muted-foreground/60">
          {menu.map(({ label, value, type, icon: Icon, onClick }, idx) =>
            idx >= 3 ? null : type === 'tab' ? (
              <TabsTrigger key={value} value={value} className="flex items-center gap-1.5 h-9">
                {Icon && <Icon className="size-3.5" />}
                <span className="text-sm">{label}</span>
              </TabsTrigger>
            ) : (
              <Button
                key={value}
                variant="ghost"
                className="w-full justify-start px-1.5 font-normal"
                onClick={onClick}
              >
                {Icon && <Icon className="size-3.5" />}
                <span className="text-sm">{label}</span>
              </Button>
            ),
          )}
          <DropdownMenu open={dropdownMenuOpen} onOpenChange={setDropdownMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant={menu.slice(3).some((m) => m.value === activeTab) ? 'default' : 'outline'}
                size="icon"
                className="size-9 shrink-0"
              >
                <MoreVertical className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {menu.slice(3).map(({ label, value, type, icon: Icon, onClick }) =>
                type === 'tab' ? (
                  <DropdownMenuItem key={value} onClick={() => setActiveTab(value)}>
                    {Icon && <Icon className="size-3.5" />}
                    <span className="text-sm">{label}</span>
                  </DropdownMenuItem>
                ) : (
                  <Button
                    key={value}
                    variant="ghost"
                    onClick={onClick}
                    className="w-full justify-start px-1.5 font-normal"
                  >
                    {Icon && <Icon className="size-3.5" />}
                    <span className="text-sm">{label}</span>
                  </Button>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TabsList>

        <TabsContent className="flex flex-col min-h-0 overflow-y-auto py-2 px-2" value="data">
          {!data ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Router />
                </EmptyMedia>
                <EmptyTitle>{translator.t('popup_empty_no_data_title')}</EmptyTitle>
                <EmptyDescription>
                  {translator.t('popup_empty_no_data_desc', translator.t('popup_collect_button'))}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  size="lg"
                  variant={isCollecting ? 'secondary' : 'default'}
                  onClick={() => void onCollect(username, password)}
                  disabled={isCollecting}
                >
                  <Play className="size-3.5" />
                  {isCollecting
                    ? translator.t('popup_collect_collecting')
                    : translator.t('popup_collect_button')}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="flex flex-col gap-1.5">
              <WanSection
                data={data}
                routerPreferencesComparison={routerPreferencesComparison}
                goToPage={goToPage}
              />
              <RemoteAccessSection
                data={data}
                routerPreferencesComparison={routerPreferencesComparison}
                goToPage={goToPage}
              />
              <WlanBandSection
                band={Band.GHz24}
                config={data.wlan24GhzConfig}
                ssids={data.wlan24GhzSsids}
                totalClients={data.topology?.['24ghz']?.totalClients ?? 0}
                routerPreferencesComparison={routerPreferencesComparison}
                goToPage={goToPage}
              />
              <WlanBandSection
                band={Band.GHz5}
                config={data.wlan5GhzConfig}
                ssids={data.wlan5GhzSsids}
                totalClients={data.topology?.['5ghz']?.totalClients ?? 0}
                routerPreferencesComparison={routerPreferencesComparison}
                goToPage={goToPage}
              />
              <DhcpSection
                data={data}
                routerPreferencesComparison={routerPreferencesComparison}
                goToPage={goToPage}
              />
              <MiscSection
                data={data}
                routerPreferencesComparison={routerPreferencesComparison}
                goToPage={goToPage}
                lastAuthCredentials={lastAuthCredentials}
              />
              {data.timestamp && (
                <p className="text-[10px] text-center text-muted-foreground pt-1">
                  {translator.t('popup_collected_at_prefix')}{' '}
                  {new Date(data.timestamp).toLocaleTimeString()}
                </p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent className="flex flex-col min-h-0 overflow-y-auto py-2 px-2" value="topology">
          <TopologySection
            data={data}
            isCollecting={isCollecting}
            onCollect={() => onCollect(username, password)}
          />
        </TabsContent>

        <TabsContent
          className="flex flex-col min-h-0 overflow-y-auto py-2 px-2"
          value="diagnostics"
        >
          <PopupDiagnosticsTab
            data={data}
            isPinging={isPinging}
            internalPingResult={internalPingResult}
            externalPingResult={externalPingResult}
            onPing={onPing}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const Popup = () => {
  return (
    <TooltipProvider>
      <AppTabProvider>
        {({ tabId, routerModel }) => (
          <PopupStatusProvider>
            <PopupDataProvider tabId={tabId} routerModel={routerModel}>
              {({
                data,
                isCollecting,
                isPinging,
                internalPingResult,
                externalPingResult,
                routerPreferencesComparison,
                onCollect,
                onClear,
                onPing,
                copyText,
                goToPage,
                rebootRouter,
                isRouterAuthenticated,
                lastAuthCredentials,
              }) => (
                <PopupContent
                  tabId={tabId}
                  routerModel={routerModel}
                  data={data}
                  isCollecting={isCollecting}
                  isPinging={isPinging}
                  internalPingResult={internalPingResult}
                  externalPingResult={externalPingResult}
                  routerPreferencesComparison={routerPreferencesComparison}
                  onCollect={onCollect}
                  onClear={onClear}
                  onPing={onPing}
                  copyText={copyText}
                  goToPage={goToPage}
                  rebootRouter={rebootRouter}
                  isRouterAuthenticated={isRouterAuthenticated}
                  lastAuthCredentials={lastAuthCredentials}
                />
              )}
            </PopupDataProvider>
          </PopupStatusProvider>
        )}
      </AppTabProvider>
    </TooltipProvider>
  );
};
