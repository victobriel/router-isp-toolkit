import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PopupStatusType } from '@/application/types';
import { services } from '@/index';
import {
  CollectMessageAction,
  ExtractionResultSchema,
  type ExtractionResult,
  type PingTestResult,
  type CollectMessage,
} from '@/domain/schemas/validation';
import type {
  CollectResponse,
  GoToPageOptions,
  RouterPage,
  RouterPageKey,
} from '@/application/types';
import {
  LAST_DATA_STORAGE_KEY,
  COPY_TEXT_TEMPLATE_STORAGE_KEY,
  LAST_EXTERNAL_IP_STORAGE_KEY,
  LAST_INTERNAL_PING_TEST_STORAGE_KEY,
  LAST_EXTERNAL_PING_TEST_STORAGE_KEY,
  PENDING_AUTH_ERROR_STORAGE_KEY,
  ROUTER_PREFERENCES_STORAGE_KEY,
} from '@/application/constants/index';
import { normalizeRouterPreferencesStorage } from '@/ui/utils/preference-storage';
import type { RouterPreferencesStore } from '@/application/types';
import { formatTime } from '@/ui/lib/utils';
import { usePopupStatus } from '@/ui/modules/popup/contexts/popup-status-context';
import { translator } from '@/infra/i18n/I18nService';
import { DiagnosticsMode } from '@/ui/types';
import { COPY_TEXT_VALUE_KEYS } from '@/ui/modules/popup/components/popup-data-provider/constants';

interface LogEntry {
  msg: string;
  type: PopupStatusType;
  time: string;
}

interface PopupDataProviderProps {
  tabId: number;
  routerModel: string;
  children: (props: {
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
  }) => React.ReactNode;
}

const EXPECTED_ERRORS = [
  'message channel closed before a response was received',
  'receiving end does not exist',
  'the tab was closed',
];

function isExpectedNavigationError(msg: string): boolean {
  return EXPECTED_ERRORS.some((s) => msg.toLowerCase().includes(s));
}

const { popupUiStateService } = services;

export type RouterPreferencesComparison = {
  // WAN / overall features
  internetEnabled?: boolean;
  tr069Enabled?: boolean;
  bandSteeringEnabled?: boolean;
  upnpEnabled?: boolean;
  requestPdEnabled?: boolean;
  slaacEnabled?: boolean;
  dhcpv6Enabled?: boolean;
  pdEnabled?: boolean;
  remoteAccessIpv4Enabled?: boolean;
  remoteAccessIpv6Enabled?: boolean;
  linkSpeed?: boolean;
  routerVersion?: boolean;
  tr069Url?: boolean;
  pppoeUsername?: boolean;
  ipVersion?: boolean;

  // DHCP
  dhcpEnabled?: boolean;
  dhcpIpAddress?: boolean;
  dhcpSubnetMask?: boolean;
  dhcpStartIp?: boolean;
  dhcpEndIp?: boolean;
  dhcpIspDnsEnabled?: boolean;
  dhcpPrimaryDns?: boolean;
  dhcpSecondaryDns?: boolean;
  dhcpLeaseTimeMode?: boolean;
  dhcpLeaseTime?: boolean;

  // WiFi 2.4 GHz
  wlan24GhzRadioEnabled?: boolean;
  wlan24GhzChannel?: boolean;
  wlan24GhzMode?: boolean;
  wlan24GhzBandWidth?: boolean;
  wlan24GhzTransmittingPower?: boolean;

  // WiFi 5 GHz
  wlan5GhzRadioEnabled?: boolean;
  wlan5GhzChannel?: boolean;
  wlan5GhzMode?: boolean;
  wlan5GhzBandWidth?: boolean;
  wlan5GhzTransmittingPower?: boolean;

  wlan24GhzSsids?: Array<{
    ssidName?: boolean;
    ssidHideMode?: boolean;
    wpa2SecurityType?: boolean;
    maxClients?: boolean;
  }>;
  wlan5GhzSsids?: Array<{
    ssidName?: boolean;
    ssidHideMode?: boolean;
    wpa2SecurityType?: boolean;
    maxClients?: boolean;
  }>;
};

export interface SsidWlanPreferencesComparison {
  ssidName: string;
  ssidHideMode: boolean;
  ssidEncryptionType: string;
  ssidMaxClients: number;
}

function boolMatch(
  actual: boolean | undefined,
  expected: boolean | undefined,
): boolean | undefined {
  if (expected === undefined || actual === undefined) return undefined;
  // Some older/incorrect stored values may use empty string for "unset".
  if ((expected as unknown) === '') return undefined;
  return actual === expected;
}

function regexMatch(actual: string | undefined, expected: string | undefined): boolean | undefined {
  // Treat unset values as "no comparison" (stored as `undefined` or empty string).
  if (expected === undefined || actual === undefined) return undefined;
  if (expected.trim() === '') return undefined;
  return new RegExp(expected).test(actual);
}

function textMatch(actual: string | undefined, expected: string | undefined): boolean | undefined {
  // Treat unset values as "no comparison" (stored as `undefined` or empty string).
  if (expected === undefined || actual === undefined) return undefined;
  if (expected === '') return undefined;
  return actual === expected;
}

function arrayMatch(
  actual: string | undefined,
  expected: string[] | undefined,
): boolean | undefined {
  if (expected === undefined || actual === undefined) return undefined;
  if (expected.length === 0) return undefined;
  return expected.some((e) => e === actual);
}

type CopyTextValueKey = (typeof COPY_TEXT_VALUE_KEYS)[number]['key'];

function translateAuthError(msg: string | undefined): string {
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
}

export const PopupDataProvider = ({ tabId, routerModel, children }: PopupDataProviderProps) => {
  const { setStatus: setStatusType, setStatusMessage } = usePopupStatus();
  const [data, setData] = useState<ExtractionResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [internalPingResult, setInternalPingResult] = useState<PingTestResult | null>(null);
  const [externalPingResult, setExternalPingResult] = useState<PingTestResult | null>(null);
  const [routerPrefsForModel, setRouterPrefsForModel] = useState<RouterPreferencesStore | null>(
    null,
  );

  const statusRef = useRef<{ type: PopupStatusType; message: string }>({
    type: PopupStatusType.NONE,
    message: translator.t('popup_status_ready'),
  });

  const setStatus = useCallback(
    (type: PopupStatusType, message: string) => {
      statusRef.current = { type, message };
      setStatusType(type);
      setStatusMessage(message);
    },
    [setStatusType, setStatusMessage],
  );

  const addLog = useCallback((msg: string, type: PopupStatusType = PopupStatusType.NONE) => {
    const entry: LogEntry = { msg, type, time: formatTime() };
    setLogs((prev) => [...prev.slice(-29), entry]);
  }, []);

  const sendToTab = useCallback(
    async <TReq, TRes = unknown>(id: number, msg: TReq): Promise<TRes> => {
      return chrome.tabs.sendMessage(id, msg as unknown) as Promise<TRes>;
    },
    [],
  );

  // Initialize: load persisted state, pending auth errors, ping results
  useEffect(() => {
    void (async () => {
      const rawPrefs = await services.storage.get<unknown>(ROUTER_PREFERENCES_STORAGE_KEY);
      const normalized = normalizeRouterPreferencesStorage(rawPrefs);
      const prefs = normalized[routerModel] ?? null;
      setRouterPrefsForModel(prefs);

      const savedState = await popupUiStateService.loadUiState(tabId);
      if (savedState) {
        setStatus(savedState.status.type, savedState.status.text);
        setLogs(savedState.logs.slice(0, 30));
      } else {
        setStatus(PopupStatusType.NONE, translator.t('popup_status_ready'));
      }

      const pendingError = await services.sessionStorage.get<string>(
        PENDING_AUTH_ERROR_STORAGE_KEY,
      );
      if (pendingError) {
        await services.sessionStorage.remove(PENDING_AUTH_ERROR_STORAGE_KEY);
        setStatus(PopupStatusType.WARN, translateAuthError(pendingError));
      }

      const lastData = await popupUiStateService.loadLastExtraction(tabId);
      if (lastData) setData(lastData);

      const internalPing = await services.sessionStorage.get<PingTestResult>(
        LAST_INTERNAL_PING_TEST_STORAGE_KEY,
      );
      if (internalPing) setInternalPingResult(internalPing);

      const externalPing = await services.sessionStorage.get<PingTestResult>(
        LAST_EXTERNAL_PING_TEST_STORAGE_KEY,
      );
      if (externalPing) setExternalPingResult(externalPing);
    })();
  }, [routerModel, tabId, setStatus]);

  const routerPreferencesComparison = useMemo<RouterPreferencesComparison | null>(() => {
    if (!data || !routerPrefsForModel) return null;

    return {
      // WAN / overall features
      internetEnabled: boolMatch(data.internetEnabled, routerPrefsForModel.internetEnabled),
      tr069Enabled: boolMatch(data.tr069Enabled, routerPrefsForModel.tr069Enabled),
      bandSteeringEnabled: boolMatch(
        data.bandSteeringEnabled,
        routerPrefsForModel.bandSteeringEnabled,
      ),
      upnpEnabled: boolMatch(data.upnpEnabled, routerPrefsForModel.upnpEnabled),
      requestPdEnabled: boolMatch(data.requestPdEnabled, routerPrefsForModel.requestPdEnabled),
      slaacEnabled: boolMatch(data.slaacEnabled, routerPrefsForModel.slaacEnabled),
      dhcpv6Enabled: boolMatch(data.dhcpv6Enabled, routerPrefsForModel.dhcpv6Enabled),
      pdEnabled: boolMatch(data.pdEnabled, routerPrefsForModel.pdEnabled),
      remoteAccessIpv4Enabled: boolMatch(
        data.remoteAccessIpv4Enabled,
        routerPrefsForModel.remoteAccessIpv4Enabled,
      ),
      remoteAccessIpv6Enabled: boolMatch(
        data.remoteAccessIpv6Enabled,
        routerPrefsForModel.remoteAccessIpv6Enabled,
      ),
      linkSpeed: regexMatch(data.linkSpeed, routerPrefsForModel.linkSpeed),
      routerVersion: textMatch(data.routerVersion, routerPrefsForModel.routerVersion),
      tr069Url: regexMatch(data.tr069Url, routerPrefsForModel.tr069Url),
      pppoeUsername: regexMatch(data.pppoeUsername, routerPrefsForModel.pppoeUsername),
      ipVersion: regexMatch(data.ipVersion, routerPrefsForModel.ipVersion),

      // DHCP
      dhcpEnabled: boolMatch(data.dhcpEnabled, routerPrefsForModel.dhcpEnabled),
      dhcpIpAddress: regexMatch(data.dhcpIpAddress, routerPrefsForModel.dhcpIpAddress),
      dhcpSubnetMask: regexMatch(data.dhcpSubnetMask, routerPrefsForModel.dhcpSubnetMask),
      dhcpStartIp: regexMatch(data.dhcpStartIp, routerPrefsForModel.dhcpStartIp),
      dhcpEndIp: regexMatch(data.dhcpEndIp, routerPrefsForModel.dhcpEndIp),
      dhcpIspDnsEnabled: boolMatch(data.dhcpIspDnsEnabled, routerPrefsForModel.dhcpIspDnsEnabled),
      dhcpPrimaryDns: regexMatch(data.dhcpPrimaryDns, routerPrefsForModel.dhcpPrimaryDns),
      dhcpSecondaryDns: regexMatch(data.dhcpSecondaryDns, routerPrefsForModel.dhcpSecondaryDns),
      dhcpLeaseTimeMode: regexMatch(data.dhcpLeaseTimeMode, routerPrefsForModel.dhcpLeaseTimeMode),
      dhcpLeaseTime: textMatch(data.dhcpLeaseTime, routerPrefsForModel.dhcpLeaseTime),

      // WiFi 2.4 GHz
      wlan24GhzRadioEnabled: boolMatch(
        data.wlan24GhzConfig?.enabled,
        routerPrefsForModel.wlan24GhzConfig?.enabled,
      ),
      wlan24GhzChannel: arrayMatch(
        data.wlan24GhzConfig?.channel,
        routerPrefsForModel.wlan24GhzConfig?.channel,
      ),
      wlan24GhzMode: regexMatch(
        data.wlan24GhzConfig?.mode,
        routerPrefsForModel.wlan24GhzConfig?.mode,
      ),
      wlan24GhzBandWidth: arrayMatch(
        data.wlan24GhzConfig?.bandWidth,
        routerPrefsForModel.wlan24GhzConfig?.bandWidth,
      ),
      wlan24GhzTransmittingPower: textMatch(
        data.wlan24GhzConfig?.transmittingPower,
        routerPrefsForModel.wlan24GhzConfig?.transmittingPower,
      ),

      // WiFi 5 GHz
      wlan5GhzRadioEnabled: boolMatch(
        data.wlan5GhzConfig?.enabled,
        routerPrefsForModel.wlan5GhzConfig?.enabled,
      ),
      wlan5GhzChannel: arrayMatch(
        data.wlan5GhzConfig?.channel,
        routerPrefsForModel.wlan5GhzConfig?.channel,
      ),
      wlan5GhzMode: regexMatch(data.wlan5GhzConfig?.mode, routerPrefsForModel.wlan5GhzConfig?.mode),
      wlan5GhzBandWidth: arrayMatch(
        data.wlan5GhzConfig?.bandWidth,
        routerPrefsForModel.wlan5GhzConfig?.bandWidth,
      ),
      wlan5GhzTransmittingPower: textMatch(
        data.wlan5GhzConfig?.transmittingPower,
        routerPrefsForModel.wlan5GhzConfig?.transmittingPower,
      ),

      // WiFi SSIDs
      wlan24GhzSsids: data.wlan24GhzSsids
        ? data.wlan24GhzSsids.map((ssid) => ({
            ssidName: regexMatch(
              ssid.ssidName,
              typeof routerPrefsForModel.wlan24GhzSsids?.ssidName === 'string'
                ? routerPrefsForModel.wlan24GhzSsids?.ssidName
                : undefined,
            ),
            ssidHideMode: boolMatch(
              ssid.ssidHideMode,
              typeof routerPrefsForModel.wlan24GhzSsids?.ssidHideMode === 'boolean'
                ? routerPrefsForModel.wlan24GhzSsids?.ssidHideMode
                : undefined,
            ),
            wpa2SecurityType: textMatch(
              ssid.wpa2SecurityType,
              typeof routerPrefsForModel.wlan24GhzSsids?.wpa2SecurityType === 'string'
                ? routerPrefsForModel.wlan24GhzSsids?.wpa2SecurityType
                : undefined,
            ),
            maxClients: regexMatch(
              String(ssid.maxClients),
              typeof routerPrefsForModel.wlan24GhzSsids?.maxClients === 'string'
                ? routerPrefsForModel.wlan24GhzSsids?.maxClients
                : undefined,
            ),
          }))
        : [],
      wlan5GhzSsids: data.wlan5GhzSsids
        ? data.wlan5GhzSsids.map((ssid) => ({
            ssidName: regexMatch(
              ssid.ssidName,
              typeof routerPrefsForModel.wlan5GhzSsids?.ssidName === 'string'
                ? routerPrefsForModel.wlan5GhzSsids?.ssidName
                : undefined,
            ),
            ssidHideMode: boolMatch(
              ssid.ssidHideMode,
              typeof routerPrefsForModel.wlan5GhzSsids?.ssidHideMode === 'boolean'
                ? routerPrefsForModel.wlan5GhzSsids?.ssidHideMode
                : undefined,
            ),
            wpa2SecurityType: textMatch(
              ssid.wpa2SecurityType,
              typeof routerPrefsForModel.wlan5GhzSsids?.wpa2SecurityType === 'string'
                ? routerPrefsForModel.wlan5GhzSsids?.wpa2SecurityType
                : undefined,
            ),
            maxClients: regexMatch(
              String(ssid.maxClients),
              typeof routerPrefsForModel.wlan5GhzSsids?.maxClients === 'string'
                ? routerPrefsForModel.wlan5GhzSsids?.maxClients
                : undefined,
            ),
          }))
        : [],
    };
  }, [data, routerPrefsForModel]);

  // Persist UI state when logs change
  useEffect(() => {
    void popupUiStateService.saveUiState(tabId, {
      status: { type: statusRef.current.type, text: statusRef.current.message },
      logs,
    });
  }, [logs, tabId]);

  const startRetryLoop = useCallback(
    async (id: number): Promise<ExtractionResult | null> => {
      const maxRetries = 5;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        addLog(translator.t('popup_log_retry_attempt', String(attempt), String(maxRetries)));
        try {
          const res = await sendToTab<CollectMessage, CollectResponse>(id, {
            action: CollectMessageAction.COLLECT,
          });
          if (res?.success && res.data) return res.data;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (!isExpectedNavigationError(msg)) addLog(msg, PopupStatusType.WARN);
        }
        if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 2000));
      }
      return null;
    },
    [addLog, sendToTab],
  );

  const onCollect = useCallback(
    async (username: string, password: string) => {
      setIsCollecting(true);
      setStatus(PopupStatusType.OK, translator.t('popup_collect_collecting'));
      addLog(translator.t('popup_log_collect_starting'));

      try {
        const authResponse = await sendToTab<CollectMessage, CollectResponse>(tabId, {
          action: CollectMessageAction.AUTHENTICATE,
          credentials: { username: username || 'admin', password },
        });

        if (!authResponse?.success) {
          const msg = translateAuthError((authResponse as { message?: string })?.message);
          setStatus(PopupStatusType.WARN, msg);
          return;
        }

        addLog(translator.t('popup_log_auth_sent_waiting'));
        const extractedData = await startRetryLoop(tabId);

        if (!extractedData) {
          setStatus(PopupStatusType.ERR, translator.t('popup_error_timeout_waiting'));
          return;
        }

        const parsed = ExtractionResultSchema.safeParse({
          ...extractedData,
          timestamp: new Date().toISOString(),
        });

        if (!parsed.success) {
          setStatus(PopupStatusType.WARN, translator.t('popup_error_unexpected_format'));
          return;
        }

        setData(parsed.data);
        await popupUiStateService.saveLastExtraction(tabId, parsed.data);
        setStatus(PopupStatusType.OK, translator.t('popup_status_collected_ok'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isExpectedNavigationError(msg)) {
          addLog(translator.t('popup_log_redirect_retry'), PopupStatusType.WARN);
          const [freshTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (freshTab?.id) {
            const retryData = await startRetryLoop(freshTab.id);
            if (retryData) {
              const parsed = ExtractionResultSchema.safeParse({
                ...retryData,
                timestamp: new Date().toISOString(),
              });
              if (parsed.success) {
                setData(parsed.data);
                await popupUiStateService.saveLastExtraction(tabId, parsed.data);
                setStatus(PopupStatusType.OK, translator.t('popup_status_collected_ok'));
                return;
              }
            }
          }
          setStatus(PopupStatusType.ERR, translator.t('popup_error_timeout_waiting'));
        } else {
          setStatus(PopupStatusType.ERR, translator.t('popup_error_router_comm'));
          addLog(msg, PopupStatusType.ERR);
        }
      } finally {
        setIsCollecting(false);
      }
    },
    [addLog, sendToTab, setStatus, startRetryLoop, tabId],
  );

  const onClear = useCallback(() => {
    setData(null);
    setLogs([]);
    setStatus(PopupStatusType.NONE, translator.t('popup_status_ready'));
    void services.sessionStorage.remove(`${LAST_DATA_STORAGE_KEY}:${String(tabId)}`);
    void popupUiStateService.saveUiState(tabId, {
      status: { type: PopupStatusType.NONE, text: translator.t('popup_status_ready') },
      logs: [],
    });
  }, [setStatus, tabId]);

  const onPing = useCallback(
    async (ip: string, mode: DiagnosticsMode) => {
      if (mode === DiagnosticsMode.EXTERNAL) {
        await services.storage.save(LAST_EXTERNAL_IP_STORAGE_KEY, ip);
      }

      setIsPinging(true);
      addLog(translator.t('popup_diagnostics_ping_started', ip));

      try {
        const response = await sendToTab<CollectMessage, CollectResponse>(tabId, {
          action: CollectMessageAction.PING,
          ip,
        });

        if (!response?.success || !response.pingResult) {
          setStatus(PopupStatusType.WARN, translator.t('popup_diagnostics_ping_error'));
          return;
        }

        if (mode === DiagnosticsMode.INTERNAL) {
          await services.sessionStorage.save(
            LAST_INTERNAL_PING_TEST_STORAGE_KEY,
            response.pingResult,
          );
          setInternalPingResult(response.pingResult);
        } else {
          await services.sessionStorage.save(
            LAST_EXTERNAL_PING_TEST_STORAGE_KEY,
            response.pingResult,
          );
          setExternalPingResult(response.pingResult);
        }

        setStatus(PopupStatusType.OK, translator.t('popup_diagnostics_ping_success'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus(PopupStatusType.ERR, translator.t('popup_error_router_comm'));
        addLog(msg, PopupStatusType.ERR);
      } finally {
        setIsPinging(false);
      }
    },
    [addLog, sendToTab, setStatus, tabId],
  );

  const copyText = useCallback(async (): Promise<{ data: string | null; error?: string }> => {
    if (!data)
      return {
        data: null,
        error: translator.t('popup_error_no_data_to_copy'),
      };
    const template = await services.storage.get<string>(COPY_TEXT_TEMPLATE_STORAGE_KEY);
    if (!template || template.trim() === '')
      return {
        data: null,
        error: translator.t('popup_error_no_copy_template'),
      };

    const asText = (v: unknown): string =>
      v === undefined || v === null || v === '' ? '-' : String(v);
    const boolText = (v: boolean | undefined): string =>
      v === undefined
        ? '-'
        : v
          ? translator.t('popup_status_enabled')
          : translator.t('popup_status_disabled');

    const wlan24 = data.wlan24GhzConfig;
    const wlan5 = data.wlan5GhzConfig;

    const values: Record<CopyTextValueKey, string> = {
      RouterModel: asText(data.routerModel),
      RouterVersion: asText(data.routerVersion),
      TR069Url: asText(data.tr069Url),
      InternetStatus: boolText(data.internetEnabled),
      TR069Status: boolText(data.tr069Enabled),
      PPPoEUsername: asText(data.pppoeUsername),
      IpVersion: asText(data.ipVersion),
      LinkMode: asText(data.linkSpeed),
      RequestPdStatus: boolText(data.requestPdEnabled),
      SlaacStatus: boolText(data.slaacEnabled),
      Dhcpv6Status: boolText(data.dhcpv6Enabled),
      PdStatus: boolText(data.pdEnabled),
      RemoteAccessIpv4Status: boolText(data.remoteAccessIpv4Enabled),
      RemoteAccessIpv6Status: boolText(data.remoteAccessIpv6Enabled),
      BandSteeringStatus: boolText(data.bandSteeringEnabled),
      CableTotalClientsConnected: String(data.topology?.['cable']?.totalClients ?? 0),
      Wlan24Status: wlan24 ? boolText(wlan24.enabled) : '-',
      Wlan24Channel: wlan24 ? asText(wlan24.channel) : '-',
      Wlan24Mode: wlan24 ? asText(wlan24.mode) : '-',
      Wlan24BandWidth: wlan24 ? asText(wlan24.bandWidth) : '-',
      Wlan24TransmittingPower: wlan24 ? asText(wlan24.transmittingPower) : '-',
      Wlan24TotalClientsConnected: String(data.topology?.['24ghz']?.totalClients ?? 0),
      Wlan5Status: wlan5 ? boolText(wlan5.enabled) : '-',
      Wlan5Channel: wlan5 ? asText(wlan5.channel) : '-',
      Wlan5Mode: wlan5 ? asText(wlan5.mode) : '-',
      Wlan5BandWidth: wlan5 ? asText(wlan5.bandWidth) : '-',
      Wlan5TransmittingPower: wlan5 ? asText(wlan5.transmittingPower) : '-',
      Wlan5TotalClientsConnected: String(data.topology?.['5ghz']?.totalClients ?? 0),
      TotalClientsConnected: String(
        (['24ghz', '5ghz', 'cable'] as const).reduce(
          (sum, band) => sum + (data.topology?.[band]?.totalClients ?? 0),
          0,
        ),
      ),
      DhcpStatus: boolText(data.dhcpEnabled),
      DhcpIpAddress: asText(data.dhcpIpAddress),
      DhcpSubnetMask: asText(data.dhcpSubnetMask),
      DhcpStartIp: asText(data.dhcpStartIp),
      DhcpEndIp: asText(data.dhcpEndIp),
      DhcpIspDnsStatus: boolText(data.dhcpIspDnsEnabled),
      DhcpPrimaryDns: asText(data.dhcpPrimaryDns),
      DhcpSecondaryDns: asText(data.dhcpSecondaryDns),
      DhcpLeaseTimeMode: asText(data.dhcpLeaseTimeMode),
      DhcpLeaseTime: asText(data.dhcpLeaseTime),
      UpnpStatus: boolText(data.upnpEnabled),
      LastInternalPingMessage: asText(internalPingResult?.message),
      LastInternalPingTime: asText(internalPingResult?.time),
      LastInternalPingIp: asText(internalPingResult?.ip),
      LastInternalPingAvgTime: asText(internalPingResult?.packets.avg),
      LastInternalPingMinTime: asText(internalPingResult?.packets.min),
      LastInternalPingMaxTime: asText(internalPingResult?.packets.max),
      LastInternalPingLoss: asText(internalPingResult?.packets.loss),
      LastInternalPingTransmitted: asText(internalPingResult?.packets.transmitted),
      LastInternalPingReceived: asText(internalPingResult?.packets.received),
      LastInternalPingMinAvgMax: asText(
        `min/avg/max = ${[internalPingResult?.packets.min, internalPingResult?.packets.avg, internalPingResult?.packets.max].join('/')} ms`,
      ),
      LastExternalPingMessage: asText(externalPingResult?.message),
      LastExternalPingTime: asText(externalPingResult?.time),
      LastExternalPingIp: asText(externalPingResult?.ip),
      LastExternalPingAvgTime: asText(externalPingResult?.packets.avg),
      LastExternalPingMinTime: asText(externalPingResult?.packets.min),
      LastExternalPingMaxTime: asText(externalPingResult?.packets.max),
      LastExternalPingLoss: asText(externalPingResult?.packets.loss),
      LastExternalPingTransmitted: asText(externalPingResult?.packets.transmitted),
      LastExternalPingReceived: asText(externalPingResult?.packets.received),
      LastExternalPingMinAvgMax: asText(
        `min/avg/max = ${[externalPingResult?.packets.min, externalPingResult?.packets.avg, externalPingResult?.packets.max].join('/')} ms`,
      ),
    };

    return {
      data: template.replace(/%([A-Za-z0-9_]+)%/g, (_match, key: string) =>
        Object.prototype.hasOwnProperty.call(values, key)
          ? values[key as CopyTextValueKey]
          : `%${key}%`,
      ),
    };
  }, [data, internalPingResult, externalPingResult]);

  const goToPage = useCallback(
    (page: RouterPage, key: RouterPageKey, options?: GoToPageOptions) => {
      void sendToTab<CollectMessage, CollectResponse>(tabId, {
        action: CollectMessageAction.GO_TO_PAGE,
        goToPageConfig: {
          page,
          key,
          options,
        },
      }).catch((error) => {
        console.error('error going to page', error);
        setStatus(PopupStatusType.ERR, translator.t('popup_error_router_comm'));
        addLog(error instanceof Error ? error.message : String(error), PopupStatusType.ERR);
      });
    },
    [addLog, sendToTab, setStatus, tabId],
  );

  const rebootRouter = useCallback(async () => {
    void sendToTab<CollectMessage, CollectResponse>(tabId, {
      action: CollectMessageAction.REBOOT,
    }).catch((error) => {
      console.error('error rebooting router', error);
      setStatus(PopupStatusType.ERR, translator.t('popup_error_router_comm'));
      addLog(error instanceof Error ? error.message : String(error), PopupStatusType.ERR);
    });
  }, [addLog, sendToTab, setStatus, tabId]);

  return children({
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
  });
};
