export interface Translator {
  t(key: string, ...subst: string[]): string;
}

export class ChromeI18nTranslator implements Translator {
  public t(key: string, ...subst: string[]): string {
    if (!chrome?.i18n?.getMessage) {
      return key;
    }

    const message = chrome.i18n.getMessage(key, subst);
    return message || key;
  }
}

export const translator = new ChromeI18nTranslator();
