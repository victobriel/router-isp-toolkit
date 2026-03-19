import { ExtractionResult } from '@/domain/schemas/validation';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';
import { Collapsible } from '@/ui/components/ui/collapsible';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/ui/components/ui/empty';
import { Separator } from '@/ui/components/ui/separator';
import { Activity, Network, Play } from 'lucide-react';
import { translator } from '@/infra/i18n/I18nService';

interface TopologyBandTableProps {
  band: string;
  clients: Array<{ name: string; ip: string; mac: string; signal: number }>;
}

function TopologyBandTable({ band, clients }: TopologyBandTableProps) {
  if (!clients.length)
    return (
      <span className="text-muted-foreground">
        {translator.t('popup_topology_no_clients_connected')}
      </span>
    );

  return (
    <div className="space-y-1">
      {clients.map((c) => {
        const rows = [
          { label: translator.t('popup_label_ssid_name'), value: c.name || c.mac },
          { label: translator.t('popup_label_ip_address'), value: c.ip || '--' },
          { label: translator.t('popup_label_mac'), value: c.mac },
        ];
        if (band !== 'cable') {
          rows.push({ label: translator.t('popup_label_signal'), value: c.signal.toString() });
        }

        return (
          <div key={c.mac} className="rounded bg-muted/70 p-1 text-sm flex flex-col gap-1">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-1">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-medium truncate">{r.value}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

interface TopologySectionProps {
  data: ExtractionResult | null;
  isCollecting: boolean;
  onCollect: () => Promise<void>;
}

export const TopologySection = ({ data, isCollecting, onCollect }: TopologySectionProps) => {
  if (!data)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Network />
          </EmptyMedia>
          <EmptyTitle>{translator.t('popup_topology_empty_title')}</EmptyTitle>
          <EmptyDescription>
            {translator.t('popup_topology_empty_desc', translator.t('popup_collect_button'))}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            size="lg"
            variant={isCollecting ? 'secondary' : 'default'}
            onClick={onCollect}
            disabled={isCollecting}
          >
            <Play className="size-3.5" />
            {isCollecting
              ? translator.t('popup_collect_collecting')
              : translator.t('popup_collect_button')}
          </Button>
        </EmptyContent>
      </Empty>
    );

  const topology = data.topology;

  if (!topology) return null;

  const totalAll =
    (topology['24ghz']?.totalClients ?? 0) +
    (topology['5ghz']?.totalClients ?? 0) +
    (topology['cable']?.totalClients ?? 0);

  return (
    <Collapsible
      defaultOpen
      title={
        <span className="flex items-center gap-1.5">
          <Activity className="size-4" />
          {translator.t('popup_tab_topology')}
        </span>
      }
      headerExtra={
        <Badge variant="outline" className="text-sm px-1.5 py-0 ml-1">
          {totalAll} {translator.t('popup_label_ssid_total_clients')}
        </Badge>
      }
      className="overflow-y-auto"
    >
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            {translator.t('popup_topology_cable_devices')} ({topology['cable'].totalClients})
          </p>
          <TopologyBandTable band="cable" clients={topology['cable'].clients} />
        </div>
        <Separator />
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            {translator.t('popup_topology_24_devices')} ({topology['24ghz'].totalClients})
          </p>
          <TopologyBandTable band="24ghz" clients={topology['24ghz'].clients} />
        </div>
        <Separator />
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            {translator.t('popup_topology_5_devices')} ({topology['5ghz'].totalClients})
          </p>
          <TopologyBandTable band="5ghz" clients={topology['5ghz'].clients} />
        </div>
      </div>
    </Collapsible>
  );
};
