export type TopologyBand = '24ghz' | '5ghz' | 'cable';

export type TopologyClient = {
  name: string;
  ip: string;
  mac: string;
  signal: number;
};

export enum DomTargetAction {
  CLICK = 'click',
  FOCUS = 'focus',
}

export type GoToPagePlan = {
  steps: (string | null)[];
  targetSelector: string;
  targetAction?: DomTargetAction;
  expandToggleSelector?: string;
  expandedAreaSelector?: string;
};
