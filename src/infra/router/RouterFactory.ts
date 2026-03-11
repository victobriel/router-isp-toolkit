import { ZteH199ADriver } from "../drivers/zte/ZteH199ADriver.js";
import { TopologySectionParser } from "../drivers/shared/TopologySectionParser.js";
import type { IRouter } from "../../domain/ports/IRouter.js";

/**
 * Infrastructure factory: creates a router adapter for the current page.
 * Composition root: wires drivers and their dependencies (e.g. TopologySectionParser).
 */
export class RouterFactory {
  public static create(): IRouter {
    const title = document.title.toLowerCase();
    const bodyText = document.body.innerText.toLowerCase();

    if (this.isZteH199A(title, bodyText)) {
      return new ZteH199ADriver(new TopologySectionParser());
    }

    throw new Error(
      "Unsupported router model: The extension does not recognize this interface"
    );
  }

  private static isZteH199A(title: string, body: string): boolean {
    const indicators = ["h199a", "zxhn", "h199"];

    for (const term of indicators) {
      if (title.includes(term) || body.includes(term)) {
        return true;
      }
    }

    return false;
  }
}
