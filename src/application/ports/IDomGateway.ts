/**
 * Port for DOM operations used by application-level UI bootstrap logic.
 * Keeps browser/DOM-specific concerns behind an abstraction for testability.
 */

export type ValueElement =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement
  | (HTMLElement & { value: string });

export interface IDomGateway {
  getElement<T extends HTMLElement>(selector: string, type: new () => T): T;
  getValueElement(selector: string): ValueElement;
  updateField(element: ValueElement, value: string): void;
}
