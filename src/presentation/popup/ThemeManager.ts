import { ThemeChoice } from "./index.js";

export class ThemeManager {
  private currentTheme: ThemeChoice = ThemeChoice.SYSTEM;

  constructor() {
    const stored = this.getStoredTheme();
    this.currentTheme = stored ?? ThemeChoice.SYSTEM;
    this.applyTheme(this.currentTheme, false);
    this.initializeToggle();
  }

  private getSystemTheme(): Exclude<ThemeChoice, ThemeChoice.SYSTEM> {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? ThemeChoice.DARK
      : ThemeChoice.LIGHT;
  }

  private getStoredTheme(): ThemeChoice | null {
    const raw = window.localStorage.getItem("routerInspectorTheme");
    if (
      raw === ThemeChoice.LIGHT ||
      raw === ThemeChoice.DARK ||
      raw === ThemeChoice.SYSTEM
    ) {
      return raw;
    }
    return null;
  }

  private saveTheme(theme: ThemeChoice): void {
    window.localStorage.setItem("routerInspectorTheme", theme);
  }

  private applyTheme(theme: ThemeChoice, persist: boolean = true): void {
    this.currentTheme = theme;
    const effective =
      theme === ThemeChoice.SYSTEM
        ? this.getSystemTheme()
        : (theme as ThemeChoice.LIGHT | ThemeChoice.DARK);

    document.documentElement.setAttribute("data-theme", effective);

    if (persist) {
      this.saveTheme(theme);
    }

    this.updateToggleUI();
  }

  private initializeToggle(): void {
    const toggle = document.querySelector<HTMLDivElement>(".theme-toggle");
    if (!toggle) return;

    toggle.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const button = target.closest<HTMLButtonElement>(".theme-toggle-option");
      if (!button) return;

      const themeAttr = button.dataset.theme as ThemeChoice | undefined;
      if (!themeAttr) return;

      this.applyTheme(themeAttr);
    });

    // Initial UI sync
    this.updateToggleUI();
  }

  private updateToggleUI(): void {
    const options = document.querySelectorAll<HTMLButtonElement>(
      ".theme-toggle-option"
    );
    options.forEach((option) => {
      const optionTheme = option.dataset.theme as ThemeChoice | undefined;
      const isActive = optionTheme === this.currentTheme;
      option.classList.toggle("active", isActive);
      option.setAttribute("aria-checked", String(isActive));
    });
  }
}
