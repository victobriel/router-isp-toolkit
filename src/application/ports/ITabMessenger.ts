/**
 * Port for sending messages to specific browser tabs.
 * Application and presentation should depend on this abstraction;
 * infra provides the concrete Chrome-based implementation.
 */
export interface ITabMessenger {
  /**
   * Sends a message to the given tab and resolves with the response.
   * If the underlying browser API rejects, the promise rejects as well.
   */
  sendToTab<TRequest, TResponse = unknown>(
    tabId: number,
    message: TRequest
  ): Promise<TResponse>;
}

