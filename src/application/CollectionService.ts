import type { Router } from "../domain/models/Router.js";
import { RouterFactory } from "../infra/router/RouterFactory.js";
import {
  CredentialsSchema,
  type CollectMessage,
} from "../domain/schemas/validation.js";
import { type CollectResponse } from "./types/index.js";

export class CollectionService {
  public static async handleCollect(
    message: CollectMessage
  ): Promise<CollectResponse> {
    const router = RouterFactory.create();
    const { action, credentials } = message;

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
        sessionStorage.setItem("router_login_pending", "true");
        sessionStorage.setItem("router_login_time", loginTime.toString());

        router.authenticate({ username, password });

        const authRedirected = await this.waitForAuthRedirect(router, 1000);

        if (!authRedirected && !router.isAuthenticated()) {
          sessionStorage.removeItem("router_login_pending");
          sessionStorage.removeItem("router_login_time");

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
