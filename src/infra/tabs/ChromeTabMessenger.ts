import type { ITabMessenger } from "../../application/ports/ITabMessenger.js";

/**
 * Chrome-specific implementation of the ITabMessenger port.
 */
export class ChromeTabMessenger implements ITabMessenger {
  public async sendToTab<TRequest, TResponse = unknown>(
    tabId: number,
    message: TRequest
  ): Promise<TResponse> {
    const response = await chrome.tabs.sendMessage(tabId, message as unknown);
    return response as TResponse;
  }
}

/**
 * Default Chrome-backed tab messenger instance.
 * Composition roots (popup, background, etc.) can use this directly.
 */
export const defaultTabMessenger: ITabMessenger = new ChromeTabMessenger();

