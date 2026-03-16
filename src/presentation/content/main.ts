import { ZodError } from "zod";

import { ContentPageUseCase } from "../../application/ContentPageUseCase.js";
import { CollectMessageSchema } from "../../domain/schemas/validation.js";
import { CollectionService } from "../../application/CollectionService.js";
import {
  ContentPageMessageAction,
  type ContentPageMessage,
} from "../popup/index.js";

// --- Overlay management ---
let overlayContainer: HTMLDivElement | null = null;

function getOrCreateOverlay(): HTMLDivElement {
  if (overlayContainer) return overlayContainer;

  const container = document.createElement("div");
  container.id = "router-isp-toolkit-overlay";
  Object.assign(container.style, {
    position: "fixed",
    top: "8px",
    right: "8px",
    zIndex: "2147483647",
    width: "380px",
    height: "calc(100vh - 16px)",
    borderRadius: "8px",
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
    display: "none",
    transition: "opacity 0.2s ease, transform 0.2s ease",
    opacity: "0",
    transform: "translateX(8px)",
  });

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("popup.html");
  Object.assign(iframe.style, {
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
  });

  container.appendChild(iframe);
  document.body.appendChild(container);
  overlayContainer = container;

  window.addEventListener("message", (event) => {
    if (
      event.source === iframe.contentWindow &&
      (event.data as { type?: string })?.type === "router-isp-toolkit-close"
    ) {
      hideOverlay();
    }
  });

  return container;
}

function showOverlay(): void {
  const container = getOrCreateOverlay();
  container.style.display = "block";
  requestAnimationFrame(() => {
    container.style.opacity = "1";
    container.style.transform = "translateX(0)";
  });
}

function hideOverlay(): void {
  if (!overlayContainer) return;
  const container = overlayContainer;
  container.style.opacity = "0";
  container.style.transform = "translateX(8px)";
  setTimeout(() => {
    container.style.display = "none";
  }, 200);
}

function toggleOverlay(): void {
  const container = getOrCreateOverlay();
  if (container.style.display === "none" || container.style.display === "") {
    showOverlay();
  } else {
    hideOverlay();
  }
}

// --- Message listener ---
chrome.runtime.onMessage.addListener(
  (rawMessage: ContentPageMessage, _sender, sendResponse) => {
    const action = rawMessage.action;

    const actions = {
      [ContentPageMessageAction.SHOW_OVERLAY]: () => {
        showOverlay();
        sendResponse({ success: true });
        return false;
      },
      [ContentPageMessageAction.HIDE_OVERLAY]: () => {
        hideOverlay();
        sendResponse({ success: true });
        return false;
      },
      [ContentPageMessageAction.TOGGLE_OVERLAY]: () => {
        toggleOverlay();
        sendResponse({ success: true });
        return false;
      },
      [ContentPageMessageAction.FILL_LOGIN_FIELDS]: () => {
        const { credentials } = rawMessage;
        if (credentials) {
          ContentPageUseCase.fillLoginFieldsWithCredentials(
            credentials.username,
            credentials.password
          );
        }
        sendResponse({ success: true });
        return false;
      },
    };

    if (action in actions) {
      return actions[action]();
    }

    const result = CollectMessageSchema.safeParse(rawMessage);

    if (!result.success) {
      return false;
    }

    CollectionService.handleCollect(result.data)
      .then(sendResponse)
      .catch((error) => {
        if (error instanceof ZodError) {
          const message = error.issues.map((issue) => issue.message).join("; ");
          sendResponse({ success: false, message });
          return;
        }

        sendResponse({
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      });

    return true;
  }
);

window.addEventListener("load", () => {
  void ContentPageUseCase.bootstrap();
});
