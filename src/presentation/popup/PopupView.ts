import { PopupStatusType } from "../../application/types/index.js";
import { DomService } from "../../infra/dom/DomService.js";

export class PopupView {
  public static setStatus(type: PopupStatusType, text: string): void {
    const dot = DomService.getElement("#popup-status-dot", HTMLElement);
    const txt = DomService.getElement("#popup-status-text", HTMLElement);
    dot.className = `popup-status-dot ${type}`;
    txt.textContent = text;
  }

  public static updateField(id: string, value: string | null): void {
    const el = DomService.getElement(`#popup-val-${id}`, HTMLElement);
    const displayValue = value === null || value === "" ? "-" : value;
    el.textContent = displayValue;
    el.className = `popup-card-value ${displayValue === "-" ? "popup-card-value--empty" : ""}`;
  }

  public static log(
    msg: string,
    type: PopupStatusType = PopupStatusType.NONE,
    time?: string
  ): void {
    const panel = DomService.getElement("#popup-log-panel", HTMLElement);
    const displayTime =
      time ?? new Date().toLocaleTimeString("en-US", { hour12: false });
    const entry = document.createElement("div");
    entry.className = "popup-log-entry";
    const timeSpan = document.createElement("span");
    timeSpan.className = "popup-log-time";
    timeSpan.textContent = `[${displayTime}]`;
    const msgSpan = document.createElement("span");
    msgSpan.className = `popup-log-msg ${type}`;
    msgSpan.textContent = msg;
    entry.append(timeSpan, msgSpan);
    panel.prepend(entry);
  }

  public static clearLogs(): void {
    const panel = DomService.getElement("#popup-log-panel", HTMLElement);
    panel.innerHTML = "";
  }
}
