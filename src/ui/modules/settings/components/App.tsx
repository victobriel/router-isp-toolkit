import { useState, useEffect } from 'react';
import { services } from '@/index';
import { COPY_TEXT_TEMPLATE_STORAGE_KEY } from '@/application/constants';
import type { ModelBookmarks } from '@/application/types';
import { translator } from '@/infra/i18n/I18nService';
import { Button } from '@/ui/components/ui/button';
import { Badge } from '@/ui/components/ui/badge';
import { Separator } from '@/ui/components/ui/separator';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { cn } from '@/ui/lib/utils';
import { Trash2, Save, Sun, Moon, Monitor, CheckCircle, XCircle } from 'lucide-react';
import { useAppTheme, type AppThemePreference } from '@/ui/hooks/use-app-theme';

interface Toast {
  id: number;
  msg: string;
  variant: 'ok' | 'err';
}

let toastCounter = 0;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = (msg: string, variant: 'ok' | 'err' = 'ok') => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, msg, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  };

  return { toasts, show };
}

// Composition-root wiring for this UI entrypoint.
const { bookmarksService } = services;

export const Settings = () => {
  const { toasts, show: showToast } = useToast();

  const { themePreference: theme, setThemePreference: setTheme } = useAppTheme();

  const [bookmarkEntries, setBookmarkEntries] = useState<Array<[string, ModelBookmarks]>>([]);
  const [totalBookmarks, setTotalBookmarks] = useState(0);
  const [copyTemplate, setCopyTemplate] = useState('');
  // const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [version, setVersion] = useState('');

  // Load data
  useEffect(() => {
    void (async () => {
      const summary = await bookmarksService.getSummary();
      setBookmarkEntries(summary.entries);
      setTotalBookmarks(summary.total);

      const tmpl = await services.storage.get<string>(COPY_TEXT_TEMPLATE_STORAGE_KEY);
      setCopyTemplate(typeof tmpl === 'string' ? tmpl : '');

      // const storedPrefs = await services.storage.get<Record<string, string>>(
      //   ROUTER_PREFERENCES_STORAGE_KEY,
      // );
      // setPrefs(storedPrefs ?? {});

      try {
        const manifest = chrome.runtime.getManifest();
        setVersion(manifest.version);
      } catch {
        setVersion('—');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshBookmarks = async () => {
    const summary = await bookmarksService.getSummary();
    setBookmarkEntries(summary.entries);
    setTotalBookmarks(summary.total);
  };

  const handleDeleteCredential = async (modelKey: string, credId: string) => {
    await bookmarksService.removeCredential(modelKey, credId);
    await refreshBookmarks();
    showToast(translator.t('settings_toast_credential_removed'), 'ok');
  };

  const handleSaveTemplate = async () => {
    if (!copyTemplate.trim()) {
      showToast(translator.t('settings_copy_template_error_empty'), 'err');
      return;
    }
    await services.storage.save(COPY_TEXT_TEMPLATE_STORAGE_KEY, copyTemplate.trim());
    showToast(translator.t('settings_copy_template_toast_saved'), 'ok');
  };

  // const handleSavePrefs = async () => {
  //   await services.storage.save(ROUTER_PREFERENCES_STORAGE_KEY, prefs);
  //   showToast('Preferences saved.', 'ok');
  // };

  const handleClearAll = async () => {
    if (!window.confirm(translator.t('settings_clear_all_confirm_prompt'))) return;
    await services.storage.clear?.();
    await refreshBookmarks();
    setCopyTemplate('');
    // setPrefs({});
    showToast(translator.t('settings_toast_all_cleared'), 'ok');
  };

  const handleTheme = (t: AppThemePreference) => {
    setTheme(t);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Toast stack */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg pointer-events-auto transition-all',
              t.variant === 'ok'
                ? 'bg-success/15 text-success border border-success/20'
                : 'bg-destructive/15 text-destructive border border-destructive/20',
            )}
          >
            {t.variant === 'ok' ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" />
            )}
            {t.msg}
          </div>
        ))}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {translator.t('settings_header_subtitle')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {translator.t('settings_header_title')} v{version}
          </p>
        </div>

        <Separator />

        {/* Theme */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{translator.t('settings_section_appearance')}</h2>
          <div className="flex gap-2">
            {(
              [
                {
                  id: 'light' as AppThemePreference,
                  label: translator.t('popup_theme_light'),
                  icon: <Sun className="h-4 w-4" />,
                },
                {
                  id: 'dark' as AppThemePreference,
                  label: translator.t('popup_theme_dark'),
                  icon: <Moon className="h-4 w-4" />,
                },
                {
                  id: 'system' as AppThemePreference,
                  label: translator.t('popup_theme_system'),
                  icon: <Monitor className="h-4 w-4" />,
                },
              ] as const
            ).map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleTheme(id)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-xs font-medium transition-all cursor-pointer',
                  theme === id
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </section>

        <Separator />

        {/* Saved credentials */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {translator.t('settings_saved_bookmarks_label')}
            </h2>
            <Badge variant="secondary">{totalBookmarks}</Badge>
          </div>

          {bookmarkEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {translator.t('settings_bookmarks_empty')}
            </p>
          ) : (
            <div className="space-y-2">
              {bookmarkEntries.map(([modelKey, { model, credentials }]) => (
                <Collapsible key={modelKey} title={model}>
                  <div className="space-y-1">
                    {credentials.map((cred) => (
                      <div
                        key={cred.id}
                        className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{cred.username}</p>
                          <p className="text-xs text-muted-foreground truncate">{cred.password}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => void handleDeleteCredential(modelKey, cred.id)}
                          aria-label={translator.t('settings_bookmarks_delete_aria', cred.username)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* Copy text template */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">
              {translator.t('settings_section_copy_template')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {translator.t('settings_copy_template_desc')}
            </p>
          </div>
          <textarea
            className="w-full h-40 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            value={copyTemplate}
            onChange={(e) => setCopyTemplate(e.target.value)}
            placeholder={translator.t('settings_copy_template_textarea_placeholder')}
          />
          <Button size="sm" onClick={handleSaveTemplate} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {translator.t('settings_copy_template_save')}
          </Button>
        </section>

        <Separator />

        {/* Router preferences */}
        {/* <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Router Preferences</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Expected channel values used to detect mis-configuration.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'expectedChannel24ghz', label: 'Expected 2.4 GHz channel' },
              { key: 'expectedChannel5ghz', label: 'Expected 5 GHz channel' },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs text-muted-foreground">{label}</label>
                <Input
                  type="text"
                  value={prefs[key] ?? ''}
                  onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.value }))}
                  data-pref-key={key}
                />
              </div>
            ))}
          </div>
          <Button size="sm" onClick={handleSavePrefs} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            Save preferences
          </Button>
        </section>

        <Separator /> */}

        {/* Danger zone */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-destructive">
            {translator.t('settings_danger_zone_title')}
          </h2>
          <div className="rounded-lg border border-destructive/30 p-4 space-y-2">
            <p className="text-sm font-medium">{translator.t('settings_clear_all_label')}</p>
            <p className="text-xs text-muted-foreground">
              {translator.t('settings_clear_all_desc')}
            </p>
            <Button variant="destructive" size="sm" onClick={handleClearAll} className="gap-1.5">
              <Trash2 className="size-3.5 text-white" />
              <span className="text-white">{translator.t('settings_clear_all_button')}</span>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
};
