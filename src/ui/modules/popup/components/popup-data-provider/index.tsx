import { useCallback, useEffect, useRef, useState } from 'react';
import { PopupStatusType } from '@/application/types';
import { services } from '@/index';
import {
  CollectMessageAction,
  ExtractionResultSchema,
  DiagnosticsMode,
  type ExtractionResult,
  type PingTestResult,
  type CollectMessage,
} from '@/domain/schemas/validation';
import type { CollectResponse } from '@/application/types';
import {
  LAST_DATA_STORAGE_KEY,
  COPY_TEXT_TEMPLATE_STORAGE_KEY,
  LAST_EXTERNAL_IP_STORAGE_KEY,
  LAST_INTERNAL_PING_TEST_STORAGE_KEY,
  LAST_EXTERNAL_PING_TEST_STORAGE_KEY,
  PENDING_AUTH_ERROR_STORAGE_KEY,
} from '@/application/constants/index';
import { formatTime } from '@/ui/lib/utils';
import { usePopupStatus } from '@/ui/modules/popup/contexts/popup-status-context';
import { translator } from '@/infra/i18n/I18nService';

interface LogEntry {
  msg: string;
  type: PopupStatusType;
  time: string;
}

interface PopupDataProviderProps {
  tabId: number;
  children: (props: {
    data: ExtractionResult | null;
    isCollecting: boolean;
    isPinging: boolean;
    internalPingResult: PingTestResult | null;
    externalPingResult: PingTestResult | null;
    onCollect: (username: string, password: string) => Promise<void>;
    onClear: () => void;
    onPing: (ip: string, mode: DiagnosticsMode) => Promise<void>;
    copyText: () => Promise<{ data: string | null; error?: string }>;
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

export const PopupDataProvider = ({ tabId, children }: PopupDataProviderProps) => {
  const { setStatus: setStatusType, setStatusMessage } = usePopupStatus();
  const [data, setData] = useState<ExtractionResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [internalPingResult, setInternalPingResult] = useState<PingTestResult | null>(null);
  const [externalPingResult, setExternalPingResult] = useState<PingTestResult | null>(null);

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
  }, [tabId, setStatus]);

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

    const values: Record<string, string> = {
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
      LastInternalPingIp: asText(internalPingResult?.ip),
      LastExternalPingMessage: asText(externalPingResult?.message),
      LastExternalPingIp: asText(externalPingResult?.ip),
    };

    return {
      data: template.replace(
        /%([A-Za-z0-9_]+)%/g,
        (_match, key: string) => values[key] ?? `%${key}%`,
      ),
    };
  }, [data, internalPingResult, externalPingResult]);

  return children({
    data,
    isCollecting,
    isPinging,
    internalPingResult,
    externalPingResult,
    onCollect,
    onClear,
    onPing,
    copyText,
  });
};
