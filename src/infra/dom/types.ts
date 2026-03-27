/** DOM value-bearing elements used by DomService. Lives in infra (browser type). */
export type HTMLValueElement =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement
  | (HTMLElement & { value: string });
