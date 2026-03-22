import { LAST_EXTERNAL_IP_STORAGE_KEY } from '@/application/constants';
import { DiagnosticsMode, ExtractionResult, PingTestResult } from '@/domain/schemas/validation';
import { services } from '@/index';
import { translator } from '@/infra/i18n/I18nService';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/ui/components/ui/toggle-group';
import { Copy, Globe, Terminal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePopupStatus } from '@/ui/modules/popup/contexts/popup-status-context';
import { PopupStatusType } from '@/application/types';
import { copyTextToClipboard } from '@/ui/utils/clipboard';

interface PopupDiagnosticsTabProps {
  data: ExtractionResult | null;
  isPinging: boolean;
  internalPingResult: PingTestResult | null;
  externalPingResult: PingTestResult | null;
  onPing: (ip: string, mode: DiagnosticsMode) => Promise<void>;
}

export const PopupDiagnosticsTab = ({
  data,
  isPinging,
  internalPingResult,
  externalPingResult,
  onPing,
}: PopupDiagnosticsTabProps) => {
  const [mode, setMode] = useState<DiagnosticsMode>(DiagnosticsMode.INTERNAL);
  const [pingOutput, setPingOutput] = useState<string | null>(null);
  const [internalIp, setInternalIp] = useState<string | undefined>(undefined);
  const [externalIp, setExternalIp] = useState<string | undefined>(undefined);

  const { setStatus, setStatusMessage } = usePopupStatus();
  // Avoid stale prop reads: wait for `internalPingResult`/`externalPingResult` to update,
  // then copy the *matching* result into `pingOutput`.
  const pendingPingRef = useRef<{
    mode: DiagnosticsMode;
    ip: string;
    requestId: number;
  } | null>(null);
  const pingRequestIdRef = useRef(0);

  const topology = data?.topology;
  const allClients = topology
    ? [
        ...(topology['24ghz']?.clients ?? []),
        ...(topology['5ghz']?.clients ?? []),
        ...(topology['cable']?.clients ?? []),
      ]
    : [];

  const handlePing = async () => {
    const ip = mode === DiagnosticsMode.INTERNAL ? internalIp?.trim() : externalIp?.trim();
    if (!ip) {
      setPingOutput(translator.t('popup_diagnostics_ip_required'));
      return;
    }
    setPingOutput(translator.t('popup_diagnostics_ping_started', ip));
    pingRequestIdRef.current += 1;
    pendingPingRef.current = {
      mode,
      ip,
      requestId: pingRequestIdRef.current,
    };
    await onPing(ip, mode);
  };

  const items = [
    {
      label: translator.t('popup_diagnostics_mode_internal'),
      value: DiagnosticsMode.INTERNAL,
      icon: <Terminal className="size-4" />,
    },
    {
      label: translator.t('popup_diagnostics_mode_external'),
      value: DiagnosticsMode.EXTERNAL,
      icon: <Globe className="size-4" />,
    },
  ];

  useEffect(() => {
    void services.storage.get<string>(LAST_EXTERNAL_IP_STORAGE_KEY).then((ip) => {
      if (ip) setExternalIp(ip);
    });
  }, []);

  useEffect(() => {
    const pending = pendingPingRef.current;
    if (!pending) return;

    // `PingTestResult` includes the IP, so we can match the result to the request.
    if (
      pending.mode === DiagnosticsMode.INTERNAL &&
      internalPingResult?.ip === pending.ip &&
      pending.requestId === pingRequestIdRef.current
    ) {
      setPingOutput(internalPingResult.message);
      pendingPingRef.current = null;
      return;
    }

    if (
      pending.mode === DiagnosticsMode.EXTERNAL &&
      externalPingResult?.ip === pending.ip &&
      pending.requestId === pingRequestIdRef.current
    ) {
      setPingOutput(externalPingResult.message);
      pendingPingRef.current = null;
    }
  }, [internalPingResult, externalPingResult]);

  const handleCopyPingResult = () => {
    if (pingOutput) void copyTextToClipboard(pingOutput);

    setStatus(PopupStatusType.OK);
    setStatusMessage(translator.t('popup_diagnostics_copy_result_status_copied'));
  };

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        variant="outline"
        type="single"
        size="default"
        value={mode}
        onValueChange={(value) => value && setMode(value as DiagnosticsMode)}
        className="w-full"
      >
        {items.map((item) => (
          <ToggleGroupItem
            key={item.value}
            value={item.value}
            aria-label={item.label}
            className="flex-1 h-9"
          >
            {item.icon}
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {mode === DiagnosticsMode.INTERNAL ? (
        <Select
          value={internalIp}
          onValueChange={(value) => setInternalIp(value)}
          disabled={!allClients.length}
        >
          <SelectTrigger className="w-full h-9!">
            <SelectValue placeholder={translator.t('popup_diagnostics_device_placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {allClients.map(
              (c) =>
                c.ip &&
                c.mac && (
                  <SelectItem key={c.mac} value={c.ip}>
                    {[c.ip, c.name || c.mac, c.mac.toUpperCase()].filter(Boolean).join(' -- ')}
                  </SelectItem>
                ),
            )}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id="popup-diagnostics-ip-input"
          type="text"
          placeholder={translator.t('popup_diagnostics_ip_placeholder')}
          value={externalIp}
          onChange={(e) => setExternalIp(e.target.value)}
          className="h-9"
        />
      )}

      <Button
        size="lg"
        onClick={handlePing}
        disabled={
          isPinging ||
          (mode === DiagnosticsMode.INTERNAL && !internalIp) ||
          (mode === DiagnosticsMode.EXTERNAL && !externalIp)
        }
        className="w-full"
      >
        <Terminal className="size-5" />
        {isPinging
          ? translator.t('popup_diagnostics_pinging')
          : translator.t('popup_diagnostics_ping_button')}
      </Button>

      {pingOutput && (
        <div className="flex flex-col gap-2">
          <textarea
            readOnly
            id="popup-diagnostics-output"
            className="w-full h-52 text-xs font-mono rounded-md border border-input bg-muted p-2 resize-none focus-visible:outline-none"
            value={pingOutput}
          />
          <Button
            variant="outline"
            size="default"
            disabled={!pingOutput}
            onClick={handleCopyPingResult}
            aria-label={translator.t('popup_diagnostics_copy_result_button_aria')}
            className="w-full h-9"
          >
            <Copy className="size-5" />
            {translator.t('popup_diagnostics_copy_result_button')}
          </Button>
        </div>
      )}
    </div>
  );
};
