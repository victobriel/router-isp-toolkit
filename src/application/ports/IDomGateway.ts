/**
 * Port for DOM operations used by application-level UI bootstrap logic.
 * Keeps browser/DOM-specific concerns behind an abstraction for testability.
 */

import { ValueElement } from '@/infra/dom/types';

export interface IDomGateway {
  isValueElement(element: Element): element is ValueElement;
  dispatchValueEvents(element: HTMLElement): void;
  getInputElement(selector: string): HTMLInputElement;
  getValueElement(selector: string): ValueElement;
  getValue(selector: string): string;
  getOptionalValue(selector: string): string | null;
  getSelectedOptionText(selector: string): string | null;
  getElement<T extends HTMLElement>(selector: string, type: new () => T): T;
  getElements<T extends HTMLElement>(selector: string, type: new () => T): T[];
  updateField(element: ValueElement, value: string): void;
  safeClick(element: HTMLElement): void;
}
