import type { TopologyClient } from './types';

/**
 * Selectors to locate client rows and cells within a topology section (LAN or WLAN).
 * Keeps parsing logic independent of concrete driver selectors (Strategy / DIP).
 */
export interface TopologyRowSelectors {
  rows: string;
  hostName: string;
  macAddr: string;
  ipAddr: string;
  rssi?: string;
}

/**
 * Parses a single RSSI/signal value from UI text (e.g. "-65 dBm" or "-65").
 * Pure function: no DOM or driver dependency (SRP).
 */
function parseRssiFromText(text: string): number {
  const match = text.match(/-?\d+/);
  if (!match) return 0;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Abstraction for parsing a topology section (table of clients) from the DOM.
 * Drivers depend on this interface; concrete parser is an infrastructure detail (DIP).
 */
export interface ITopologySectionParser {
  parse(container: HTMLElement, selectors: TopologyRowSelectors): TopologyClient[];
}

/**
 * Default implementation: parses a DOM section (e.g. LAN or WLAN table)
 * into a list of TopologyClient using the given selectors.
 * Single responsibility: section → clients; no navigation or driver logic.
 */
export class TopologySectionParser implements ITopologySectionParser {
  public parse(
    container: HTMLElement,
    { rows, hostName, macAddr, ipAddr, rssi }: TopologyRowSelectors,
  ): TopologyClient[] {
    const result: TopologyClient[] = [];
    const rowElements = container.querySelectorAll<HTMLElement>(rows);

    for (const row of rowElements) {
      const name = row.querySelector<HTMLElement>(hostName)?.textContent?.trim() ?? '';
      const mac = row.querySelector<HTMLElement>(macAddr)?.textContent?.trim() ?? '';
      const ip = row.querySelector<HTMLElement>(ipAddr)?.textContent?.trim() ?? '';

      if (!mac) continue;

      const signal = rssi
        ? parseRssiFromText(row.querySelector<HTMLElement>(rssi)?.textContent?.trim() ?? '')
        : 0;

      result.push({
        name: name || mac,
        ip,
        mac,
        signal,
      });
    }

    return result;
  }
}
