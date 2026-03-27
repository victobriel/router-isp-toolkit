/**
 * Port for DOM operations used by application-level UI bootstrap logic.
 * Keeps browser/DOM-specific concerns behind an abstraction for testability.
 */

import type { HTMLValueElement } from '@/infra/dom/types';

export interface IDomGateway {
  getHTMLElement<T extends HTMLElement>(selector: string, type: new () => T): T | null;
  getHTMLElements<T extends HTMLElement>(selector: string, type: new () => T): T[];
  getElementValue(selector: string): string | null;
  getElementSelectedOptionText(selector: string): string | null;
  updateHTMLElementValue(element: HTMLValueElement, value: string): void;
  safeClick(element: HTMLElement): void;
}
