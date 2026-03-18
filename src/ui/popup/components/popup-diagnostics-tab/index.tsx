import { DiagnosticsMode, ExtractionResult, PingTestResult } from '@/domain/schemas/validation';
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
import { useState } from 'react';

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
  const [selectedIp, setSelectedIp] = useState('');
  const [pingOutput, setPingOutput] = useState('');

  const topology = data?.topology;
  const allClients = topology
    ? [...topology['24ghz'].clients, ...topology['5ghz'].clients, ...topology['cable'].clients]
    : [];

  const handlePing = async () => {
    const ip = selectedIp.trim();
    if (!ip) {
      setPingOutput('Please select or enter an IP address.');
      return;
    }
    setPingOutput(`Pinging ${ip}...`);
    await onPing(ip, mode);
    const result = mode === DiagnosticsMode.INTERNAL ? internalPingResult : externalPingResult;
    if (result) {
      setPingOutput(result.message);
    }
  };

  const items = [
    {
      label: 'Internal',
      value: DiagnosticsMode.INTERNAL,
      icon: <Terminal className="size-4" />,
    },
    {
      label: 'External',
      value: DiagnosticsMode.EXTERNAL,
      icon: <Globe className="size-4" />,
    },
  ];

  const handleCopyPingResult = () => {
    if (pingOutput)
      void navigator.clipboard.writeText(pingOutput).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = pingOutput;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      });
  };

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        variant="outline"
        type="single"
        size="default"
        defaultValue={DiagnosticsMode.INTERNAL}
        onValueChange={(value) => setMode(value as DiagnosticsMode)}
        className="w-full"
      >
        {items.map((item) => (
          <ToggleGroupItem
            key={item.value}
            value={item.value}
            aria-label={`Toggle ${item.label}`}
            className="flex-1 h-9"
          >
            {item.icon}
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {mode === DiagnosticsMode.INTERNAL ? (
        <Select
          value={selectedIp}
          onValueChange={(value) => setSelectedIp(value)}
          disabled={!allClients.length}
        >
          <SelectTrigger className="w-full h-9!">
            <SelectValue placeholder="Select a device..." />
          </SelectTrigger>
          <SelectContent>
            {allClients.map((c) => (
              <SelectItem key={c.mac} value={c.ip}>
                {[c.ip, c.name || c.mac, c.mac.toUpperCase()].filter(Boolean).join(' -- ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id="popup-diagnostics-ip-input"
          type="text"
          placeholder="IP address (e.g. 8.8.8.8)"
          value={selectedIp}
          onChange={(e) => setSelectedIp(e.target.value)}
          className="h-9"
        />
      )}

      <Button
        size="lg"
        onClick={handlePing}
        disabled={isPinging || (mode === DiagnosticsMode.INTERNAL && !selectedIp)}
        className="w-full"
      >
        <Terminal className="size-5" />
        {isPinging ? 'Pinging...' : 'Ping'}
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
            aria-label="Copy ping result"
            className="w-full h-9"
          >
            <Copy className="size-5" />
            Copy result
          </Button>
        </div>
      )}
    </div>
  );
};
