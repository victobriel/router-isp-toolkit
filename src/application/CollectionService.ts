import type { CollectResponse } from "./types/index.js";
import type { Router } from "../domain/models/Router.js";
import {
  CredentialsSchema,
  type CollectMessage,
} from "../domain/schemas/validation.js";
import { RouterFactory } from "../infra/router/RouterFactory.js";
import { SessionStorageService } from "../infra/storage/SessionStorageService.js";

export class CollectionService {
  public static async handleCollect(
    message: CollectMessage
  ): Promise<CollectResponse> {
    const router = RouterFactory.create();
    const { action, credentials, ip } = message;

    const actions = {
      collect: async () => await this.executeExtraction(router),
      authenticate: async () => {
        if (router.isAuthenticated()) {
          return {
            success: true,
            message: "Router is already authenticated",
          };
        }

        if (!credentials) {
          return {
            success: false,
            message: "Credentials are required for authentication",
          };
        }

        const { username, password } = CredentialsSchema.parse(credentials);

        const loginTime = Date.now();
        await SessionStorageService.save("router_login_pending", "true");
        await SessionStorageService.save(
          "router_login_time",
          loginTime.toString()
        );

        router.authenticate({ username, password });

        const authRedirected = await this.waitForAuthRedirect(router, 1000);

        if (!authRedirected && !router.isAuthenticated()) {
          await SessionStorageService.remove("router_login_pending");
          await SessionStorageService.remove("router_login_time");

          return {
            success: false,
            message:
              "Authentication failed. Please verify your username and password and try again",
          };
        }

        return {
          success: true,
          message: "Authentication in progress",
        };
      },
      ping: async () => {
        if (!router.isAuthenticated()) {
          return {
            success: false,
            message:
              "Router is not authenticated. Please authenticate before running diagnostics.",
          };
        }

        if (!ip) {
          return {
            success: false,
            message: "IP address is required for ping diagnostics.",
          };
        }

        const result = await router.ping(ip);

        return {
          success: result ? true : false,
          message: result ? "Ping request successful" : "Ping request failed",
          pingResult: result,
        };
      },
    };

    const handler = actions[action];
    if (!handler) {
      return {
        success: false,
        message: "Internal error: Unknown collect action requested",
      };
    }

    return await handler();
  }

  private static async executeExtraction(
    router: Router
  ): Promise<CollectResponse> {
    const data = await router.extract();
    const hasData = Object.values(data).some((value) => value !== null);

    return {
      success: hasData,
      message: hasData
        ? "Data extracted successfully from the router"
        : "No data could be extracted from the router",
      data,
    };
  }

  /*
   * Waits for the router to redirect after login (authenticated state).
   * @param router - The router to wait for.
   * @param timeoutMs - The timeout in milliseconds.
   * @returns True if the router became authenticated, false on timeout.
   */
  private static async waitForAuthRedirect(
    router: Router,
    timeoutMs = 8000
  ): Promise<boolean> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (router.isAuthenticated()) {
          clearInterval(interval);
          resolve(true);
          return;
        }
        if (Date.now() - startTime >= timeoutMs) {
          clearInterval(interval);
          resolve(false);
        }
      }, 300);
    });
  }
}
