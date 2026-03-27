import { useState, useEffect } from 'react';
import { services } from '@/index';
import {
  BOOKMARKS_STORAGE_KEY,
  COPY_TEXT_TEMPLATE_STORAGE_KEY,
  EXTRACTION_FILTER_STORAGE_KEY,
  ROUTER_PREFERENCES_STORAGE_KEY,
  SETTINGS_EXPORT_SCHEMA_VERSION,
} from '@/application/constants';
import { normalizeRouterPreferencesStorage } from '@/ui/lib/preference-storage';
import type {
  ExtractionFilter,
  ExtractionFilterKey,
  ModelBookmarks,
  RouterPreferencesByModel,
  RouterPreferencesStore,
} from '@/application/types';
import {
  EXTRACTION_FILTER_KEYS,
  RouterPreferencesByModelSchema,
  normalizeExtractionFilter,
} from '@/application/types';
import { translator } from '@/infra/i18n/I18nService';
import { Button } from '@/ui/components/ui/button';
import { Badge } from '@/ui/components/ui/badge';
import { Separator } from '@/ui/components/ui/separator';
import { Collapsible } from '@/ui/components/ui/collapsible';
import { Trash2, Save, Sun, Moon, Monitor, Copy, Upload, Download } from 'lucide-react';
import { useAppTheme, type AppThemePreference } from '@/ui/hooks/use-app-theme';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/ui/components/ui/accordion';
import { copyTextToClipboard } from '@/ui/lib/clipboard';
import { RouterPreferenceSection } from '@/ui/modules/settings/components/router-preference-section';
import { cn } from '@/ui/lib/utils';
import {
  downloadJsonFile,
  normalizeImportBookmarkStore,
  type SettingsConfigSectionKey,
} from '@/ui/modules/settings/utils/settings-import-export';
import { SettingsImportExportModal } from '@/ui/modules/settings/components/settings-import-export-modal';
import {
  SettingsToastStack,
  useSettingsToast,
} from '@/ui/modules/settings/components/settings-toast-stack';
import { COPY_TEXT_VALUE_KEYS } from '@/ui/modules/popup/components/popup-data-provider/constants';

// Composition-root wiring for this UI entrypoint.
const { bookmarksService } = services;

export const Settings = () => {
  const { toasts, show: showToast } = useSettingsToast();
  const { themePreference: theme, setThemePreference: setTheme } = useAppTheme();

  const [bookmarkEntries, setBookmarkEntries] = useState<Array<[string, ModelBookmarks]>>([]);
  const [totalBookmarks, setTotalBookmarks] = useState(0);
  const [copyTemplate, setCopyTemplate] = useState('');
  const [extractionFilter, setExtractionFilter] = useState<ExtractionFilter>([
    ...EXTRACTION_FILTER_KEYS,
  ]);
  const [prefsByModel, setPrefsByModel] = useState<RouterPreferencesByModel>({});
  const [selectedModelKey, setSelectedModelKey] = useState('');
  const [version, setVersion] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importSections, setImportSections] = useState<Record<SettingsConfigSectionKey, boolean>>({
    bookmarks: true,
    copyTextTemplate: true,
    routerPreferences: true,
  });
  const [exportSections, setExportSections] = useState<Record<SettingsConfigSectionKey, boolean>>({
    bookmarks: true,
    copyTextTemplate: true,
    routerPreferences: true,
  });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Load data
  useEffect(() => {
    void (async () => {
      const summary = await bookmarksService.getSummary();
      setBookmarkEntries(summary.entries);
      setTotalBookmarks(summary.total);

      const tmpl = await services.storage.get<string>(COPY_TEXT_TEMPLATE_STORAGE_KEY);
      setCopyTemplate(typeof tmpl === 'string' ? tmpl : '');

      const rawFilter = await services.storage.get<unknown>(EXTRACTION_FILTER_STORAGE_KEY);
      setExtractionFilter(normalizeExtractionFilter(rawFilter));

      const rawPrefs = await services.storage.get<unknown>(ROUTER_PREFERENCES_STORAGE_KEY);
      setPrefsByModel(normalizeRouterPreferencesStorage(rawPrefs));

      try {
        const manifest = chrome.runtime.getManifest();
        setVersion(manifest.version);
      } catch {
        setVersion('—');
      }
    })();
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

  const handleToggleExtractionFilter = (key: ExtractionFilterKey) => {
    setExtractionFilter((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter((entry) => entry !== key);
      }
      return [...prev, key];
    });
  };

  const handleSaveExtractionFilter = async () => {
    if (!extractionFilter.length) {
      showToast(translator.t('settings_extraction_filter_error_empty'), 'err');
      return;
    }

    await services.storage.save(EXTRACTION_FILTER_STORAGE_KEY, extractionFilter);
    showToast(translator.t('settings_extraction_filter_toast_saved'), 'ok');
  };

  const handleSavePrefsForModel = async (modelKey: string, prefs: RouterPreferencesStore) => {
    const key = modelKey.trim();
    if (!key) {
      showToast(translator.t('settings_prefs_model_required'), 'err');
      return;
    }
    const next = { ...prefsByModel, [key]: prefs };
    await services.storage.save(ROUTER_PREFERENCES_STORAGE_KEY, next);
    setPrefsByModel(next);
    showToast(translator.t('settings_router_preferences_toast_saved'), 'ok');
  };

  const handleClearAll = async () => {
    if (!window.confirm(translator.t('settings_clear_all_confirm_prompt'))) return;
    await services.storage.clear?.();
    await refreshBookmarks();
    setCopyTemplate('');
    setExtractionFilter([...EXTRACTION_FILTER_KEYS]);
    setPrefsByModel({});
    setSelectedModelKey('');
    showToast(translator.t('settings_toast_all_cleared'), 'ok');
  };

  const getSectionLabel = (key: SettingsConfigSectionKey) => {
    if (key === 'bookmarks') return translator.t('settings_saved_bookmarks_label');
    if (key === 'copyTextTemplate') return translator.t('settings_section_copy_template');
    return translator.t('settings_section_router_preferences');
  };

  const selectedImportSectionKeys = (
    Object.keys(importSections) as SettingsConfigSectionKey[]
  ).filter((k) => importSections[k]);
  const selectedExportSectionKeys = (
    Object.keys(exportSections) as SettingsConfigSectionKey[]
  ).filter((k) => exportSections[k]);

  const handleExport = async () => {
    if (!selectedExportSectionKeys.length) {
      showToast(translator.t('settings_export_error_no_sections'), 'err');
      return;
    }

    setIsExporting(true);
    try {
      const data: Record<string, unknown> = {};

      if (exportSections.bookmarks) {
        data.bookmarks = (await services.storage.get<unknown>(BOOKMARKS_STORAGE_KEY)) ?? {};
      }

      if (exportSections.copyTextTemplate) {
        data.copyTextTemplate =
          (await services.storage.get<string>(COPY_TEXT_TEMPLATE_STORAGE_KEY)) ?? '';
      }

      if (exportSections.routerPreferences) {
        const rawPrefs = await services.storage.get<unknown>(ROUTER_PREFERENCES_STORAGE_KEY);
        data.routerPreferences = normalizeRouterPreferencesStorage(rawPrefs);
      }

      const exportFile = {
        schemaVersion: SETTINGS_EXPORT_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        data,
      };

      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      downloadJsonFile(`router-isp-toolkit-settings-${ts}.json`, exportFile);
      showToast(translator.t('settings_export_toast_success'), 'ok');
      setExportOpen(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      showToast(translator.t('settings_export_toast_error'), 'err');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!selectedImportSectionKeys.length) {
      showToast(translator.t('settings_import_error_no_sections'), 'err');
      return;
    }
    if (!importFile) {
      showToast(translator.t('settings_import_error_no_file'), 'err');
      return;
    }

    setIsImporting(true);
    try {
      const rawText = await importFile.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        showToast(translator.t('settings_import_error_invalid_json'), 'err');
        return;
      }

      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        showToast(translator.t('settings_import_error_invalid_json'), 'err');
        return;
      }

      const root = parsed as Record<string, unknown>;

      const rawSchemaVersion = root.schemaVersion;
      let fileSchemaVersion: number;
      if (rawSchemaVersion === undefined || rawSchemaVersion === null) {
        fileSchemaVersion = 1;
      } else if (typeof rawSchemaVersion !== 'number' || !Number.isInteger(rawSchemaVersion)) {
        showToast(translator.t('settings_import_error_invalid_schema_version'), 'err');
        return;
      } else {
        fileSchemaVersion = rawSchemaVersion;
      }

      if (fileSchemaVersion < 1 || fileSchemaVersion > SETTINGS_EXPORT_SCHEMA_VERSION) {
        if (fileSchemaVersion > SETTINGS_EXPORT_SCHEMA_VERSION) {
          showToast(translator.t('settings_import_error_newer_schema_version'), 'err');
        } else {
          showToast(translator.t('settings_import_error_unsupported_schema_version'), 'err');
        }
        return;
      }

      const exportData = root.data;
      if (exportData == null || typeof exportData !== 'object' || Array.isArray(exportData)) {
        showToast(translator.t('settings_import_error_invalid_json'), 'err');
        return;
      }

      const next = exportData as Record<string, unknown>;
      for (const k of selectedImportSectionKeys) {
        if (k === 'bookmarks' && next.bookmarks == null) {
          showToast(
            translator.t('settings_import_error_missing_section', getSectionLabel(k)),
            'err',
          );
          return;
        }
        if (k === 'copyTextTemplate' && next.copyTextTemplate == null) {
          showToast(
            translator.t('settings_import_error_missing_section', getSectionLabel(k)),
            'err',
          );
          return;
        }
        if (k === 'routerPreferences' && next.routerPreferences == null) {
          showToast(
            translator.t('settings_import_error_missing_section', getSectionLabel(k)),
            'err',
          );
          return;
        }
      }

      if (importSections.bookmarks) {
        const bm = normalizeImportBookmarkStore(next.bookmarks);
        if (!bm) {
          showToast(translator.t('settings_import_error_invalid_bookmarks'), 'err');
          return;
        }
        await services.storage.save(BOOKMARKS_STORAGE_KEY, bm);
      }

      if (importSections.copyTextTemplate) {
        const t = next.copyTextTemplate;
        if (typeof t !== 'string') {
          showToast(translator.t('settings_import_error_invalid_copy_template'), 'err');
          return;
        }
        await services.storage.save(COPY_TEXT_TEMPLATE_STORAGE_KEY, t);
        setCopyTemplate(t);
      }

      if (importSections.routerPreferences) {
        const parsedPrefs = RouterPreferencesByModelSchema.safeParse(next.routerPreferences);
        if (!parsedPrefs.success) {
          showToast(translator.t('settings_import_error_invalid_router_preferences'), 'err');
          return;
        }
        await services.storage.save(ROUTER_PREFERENCES_STORAGE_KEY, parsedPrefs.data);
        setPrefsByModel(parsedPrefs.data);
      }

      if (importSections.bookmarks) await refreshBookmarks();

      showToast(translator.t('settings_import_toast_success'), 'ok');
      setImportFile(null);
      setImportOpen(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      showToast(translator.t('settings_import_toast_error'), 'err');
    } finally {
      setIsImporting(false);
    }
  };

  const handleTheme = (t: AppThemePreference) => {
    setTheme(t);
  };

  const handleCopyPlaceholder = (key: string) => {
    void copyTextToClipboard(`%${key}%`);
    showToast(translator.t('settings_copy_template_toast_copied'), 'ok');
  };

  const themeOptions = [
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
  ] as const;

  const extractionFilterLabels: Record<ExtractionFilterKey, string> = {
    topology: translator.t('settings_extraction_filter_option_topology'),
    wan: translator.t('settings_extraction_filter_option_wan'),
    remoteAccess: translator.t('settings_extraction_filter_option_remote_access'),
    wlan: translator.t('settings_extraction_filter_option_wlan'),
    lan: translator.t('settings_extraction_filter_option_lan'),
    upnp: translator.t('settings_extraction_filter_option_upnp'),
    tr069: translator.t('settings_extraction_filter_option_tr069'),
    routerInfo: translator.t('settings_extraction_filter_option_router_info'),
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SettingsToastStack toasts={toasts} />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {translator.t('settings_header_subtitle')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {translator.t('settings_header_title')} v{version}
          </p>
        </div>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{translator.t('settings_section_appearance')}</h2>
          <div className="flex gap-2">
            {themeOptions.map(({ id, label, icon }) => (
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
          <Accordion type="single" collapsible>
            <AccordionItem value="available_placeholders">
              <AccordionTrigger>{translator.t('settings_copy_template_hint')}</AccordionTrigger>
              <AccordionContent>
                <ul className="list-disc list-inside text-xs text-muted-foreground">
                  {COPY_TEXT_VALUE_KEYS.map(({ key, description }) => (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-2 h-7 border-b border-border hover:bg-muted/50"
                    >
                      <div className="flex items-center">
                        <span className="font-medium">{`%${key}%`}</span>
                        <span className="mx-1">-</span>
                        <span>{description}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleCopyPlaceholder(key)}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <Button size="sm" onClick={handleSaveTemplate} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {translator.t('settings_copy_template_save')}
          </Button>
        </section>

        <Separator />

        <RouterPreferenceSection
          bookmarkEntries={bookmarkEntries}
          existingPreferenceModelKeys={Object.keys(prefsByModel)}
          selectedModelKey={selectedModelKey}
          onSelectedModelKeyChange={setSelectedModelKey}
          prefs={prefsByModel[selectedModelKey] ?? {}}
          onSavePrefs={(prefs) => void handleSavePrefsForModel(selectedModelKey, prefs)}
        />

        <Separator />

        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">
              {translator.t('settings_import_export_section_title')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {translator.t('settings_import_export_section_desc')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setImportOpen(true)}
              className="gap-1.5 flex-1"
              type="button"
            >
              <Upload className="h-3.5 w-3.5" />
              {translator.t('settings_import_button')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExportOpen(true)}
              className="gap-1.5 flex-1"
              type="button"
              disabled={isExporting}
            >
              <Download className="h-3.5 w-3.5" />
              {translator.t('settings_export_button')}
            </Button>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">
              {translator.t('settings_extraction_filter_title')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {translator.t('settings_extraction_filter_desc')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {EXTRACTION_FILTER_KEYS.map((key) => {
              const active = extractionFilter.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleToggleExtractionFilter(key)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-xs text-left transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  {extractionFilterLabels[key]}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {translator.t('settings_extraction_filter_hint')}
          </p>
          <Button size="sm" onClick={() => void handleSaveExtractionFilter()} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {translator.t('settings_extraction_filter_save')}
          </Button>
        </section>

        <Separator />

        <SettingsImportExportModal
          variant="import"
          open={importOpen}
          onRequestClose={() => {
            setImportOpen(false);
            setImportFile(null);
          }}
          sections={importSections}
          setSections={setImportSections}
          isBusy={isImporting}
          onConfirm={handleImport}
          getSectionLabel={getSectionLabel}
          importFile={importFile}
          onImportFileChange={setImportFile}
        />

        <SettingsImportExportModal
          variant="export"
          open={exportOpen}
          onRequestClose={() => setExportOpen(false)}
          sections={exportSections}
          setSections={setExportSections}
          isBusy={isExporting}
          onConfirm={handleExport}
          getSectionLabel={getSectionLabel}
        />

        <Separator />

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
