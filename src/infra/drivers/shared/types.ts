export type TopologyBand = '24ghz' | '5ghz' | 'cable';

export type TopologyClient = {
  name: string;
  ip: string;
  mac: string;
  signal: number;
};
