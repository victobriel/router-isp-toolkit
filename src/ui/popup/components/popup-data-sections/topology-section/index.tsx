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

interface TopologyBandTableProps {
  band: string;
  clients: Array<{ name: string; ip: string; mac: string; signal: number }>;
}

function TopologyBandTable({ band, clients }: TopologyBandTableProps) {
  if (!clients.length) return <span className="text-muted-foreground">No clients connected.</span>;

  return (
    <div className="space-y-1">
      {clients.map((c) => {
        const rows = [
          { label: 'Name', value: c.name || c.mac },
          { label: 'IP', value: c.ip || '--' },
          { label: 'MAC', value: c.mac },
        ];
        if (band !== 'cable') {
          rows.push({ label: 'Signal', value: c.signal.toString() });
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
          <EmptyTitle>No topology data available.</EmptyTitle>
          <EmptyDescription>Collect data to see topology.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            size="lg"
            variant={isCollecting ? 'secondary' : 'default'}
            onClick={onCollect}
            disabled={isCollecting}
          >
            <Play className="size-3.5" />
            {isCollecting ? 'Collecting...' : 'Collect data'}
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
          Topology
        </span>
      }
      headerExtra={
        <Badge variant="outline" className="text-sm px-1.5 py-0 ml-1">
          {totalAll} clients
        </Badge>
      }
      className="overflow-y-auto"
    >
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            Cable ({topology['cable'].totalClients})
          </p>
          <TopologyBandTable band="cable" clients={topology['cable'].clients} />
        </div>
        <Separator />
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            2.4 GHz ({topology['24ghz'].totalClients})
          </p>
          <TopologyBandTable band="24ghz" clients={topology['24ghz'].clients} />
        </div>
        <Separator />
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            5 GHz ({topology['5ghz'].totalClients})
          </p>
          <TopologyBandTable band="5ghz" clients={topology['5ghz'].clients} />
        </div>
      </div>
    </Collapsible>
  );
};
