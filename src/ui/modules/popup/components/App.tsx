import { useEffect, useState } from 'react';
import { DiagnosticsMode } from '@/domain/schemas/validation';
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
} from 'lucide-react';
import { PopupHeader } from '@/ui/modules/popup/components/popup-header';
import { PopupCredentials } from '@/ui/modules/popup/components/popup-credentials';
import { AppTabProvider } from '@/ui/modules/popup/components/app-tab-provider';
import { PopupStatusProvider } from '@/ui/modules/popup/components/popup-status-provider';
import { PopupDataProvider } from '@/ui/modules/popup/components/popup-data-provider';
import type { RouterPreferencesComparison } from '@/ui/modules/popup/components/popup-data-provider';
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
import { PopupStatusType } from '@/application/types';
import { usePopupStatus } from '@/ui/modules/popup/contexts/popup-status-context';
import { copyTextToClipboard } from '@/ui/utils/clipboard';
import { translator } from '@/infra/i18n/I18nService';

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
  onClear,
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

    await copyTextToClipboard(text);

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

  return (
    <div className="flex flex-col h-screen bg-background text-foreground text-sm">
      <PopupHeader routerModel={routerModel} />
      <PopupStatus />
      <PopupCredentials
        tabId={tabId}
        routerModel={routerModel}
        username={username}
        password={password}
        hasData={!!data}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
      />

      {data && (
        <div className="bg-background border-t border-border">
          <div className="grid grid-cols-3 gap-2 py-2 pl-4 pr-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs! h-9!"
              onClick={() => void onCollect(username, password)}
              disabled={isCollecting}
            >
              <RefreshCw className="size-4" />
              {isCollecting
                ? translator.t('popup_collect_collecting')
                : translator.t('popup_collect_refresh_button')}
            </Button>
            <Button variant="outline" size="sm" className="text-xs! h-9!" onClick={handleClearData}>
              <Trash className="size-4" />
              {translator.t('popup_clear_aria_label')}
            </Button>
            <Button variant="outline" size="sm" className="text-xs! h-9!" onClick={handleCopyText}>
              <Copy className="size-4" />
              {translator.t('popup_copy_text')}
            </Button>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
        <TabsList className="shrink-0 gap-1.5 pl-4 pr-2 rounded-none! py-1">
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

        <TabsContent className="flex flex-col min-h-0 overflow-y-auto py-2 pl-4 pr-2" value="data">
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
              <WanSection data={data} routerPreferencesComparison={routerPreferencesComparison} />
              <RemoteAccessSection
                data={data}
                routerPreferencesComparison={routerPreferencesComparison}
              />
              <WlanBandSection
                band={Band.GHz24}
                config={data.wlan24GhzConfig}
                ssids={data.wlan24GhzSsids}
                totalClients={data.topology?.['24ghz']?.totalClients ?? 0}
                routerPreferencesComparison={routerPreferencesComparison}
              />
              <WlanBandSection
                band={Band.GHz5}
                config={data.wlan5GhzConfig}
                ssids={data.wlan5GhzSsids}
                totalClients={data.topology?.['5ghz']?.totalClients ?? 0}
                routerPreferencesComparison={routerPreferencesComparison}
              />
              <DhcpSection data={data} routerPreferencesComparison={routerPreferencesComparison} />
              <MiscSection data={data} routerPreferencesComparison={routerPreferencesComparison} />
              {data.timestamp && (
                <p className="text-[10px] text-center text-muted-foreground pt-1">
                  {translator.t('popup_collected_at_prefix')}{' '}
                  {new Date(data.timestamp).toLocaleTimeString()}
                </p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent
          className="flex flex-col min-h-0 overflow-y-auto py-2 pl-4 pr-2"
          value="topology"
        >
          <TopologySection
            data={data}
            isCollecting={isCollecting}
            onCollect={() => onCollect(username, password)}
          />
        </TabsContent>

        <TabsContent
          className="flex flex-col min-h-0 overflow-y-auto py-2 pl-4 pr-2"
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

export const Popup = () => (
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
            />
          )}
        </PopupDataProvider>
      </PopupStatusProvider>
    )}
  </AppTabProvider>
);
