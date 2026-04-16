import type { Dispatch, SetStateAction } from 'react';
import { Download, Upload } from 'lucide-react';
import { translator } from '@/infra/i18n/I18nService';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import type { SettingsConfigSectionKey } from '../utils/settings-import-export';

const SECTION_KEYS: SettingsConfigSectionKey[] = [
  'bookmarks',
  'copyTextTemplate',
  'routerPreferences',
];

type BaseProps = {
  open: boolean;
  onRequestClose: () => void;
  sections: Record<SettingsConfigSectionKey, boolean>;
  setSections: Dispatch<SetStateAction<Record<SettingsConfigSectionKey, boolean>>>;
  isBusy: boolean;
  onConfirm: () => void;
  getSectionLabel: (key: SettingsConfigSectionKey) => string;
};

type ImportModalProps = BaseProps & {
  variant: 'import';
  importFile: File | null;
  onImportFileChange: (file: File | null) => void;
};

type ExportModalProps = BaseProps & {
  variant: 'export';
};

export type SettingsImportExportModalProps = ImportModalProps | ExportModalProps;

export function SettingsImportExportModal(props: SettingsImportExportModalProps) {
  const {
    variant,
    open,
    onRequestClose,
    sections,
    setSections,
    isBusy,
    onConfirm,
    getSectionLabel,
  } = props;

  if (!open) return null;

  const isImport = variant === 'import';
  const title = isImport
    ? translator.t('settings_import_dialog_title')
    : translator.t('settings_export_dialog_title');
  const description = isImport
    ? translator.t('settings_import_dialog_desc')
    : translator.t('settings_export_dialog_desc');
  const ConfirmIcon = isImport ? Upload : Download;
  const confirmLabel = isImport
    ? translator.t('settings_import_confirm_button')
    : translator.t('settings_export_confirm_button');

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={() => !isBusy && onRequestClose()} />

      <div className="relative w-full max-w-lg rounded-lg border border-border bg-background p-4 shadow-lg">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-foreground">
              {translator.t('settings_dialog_sections_label')}
            </div>
            <div className="flex flex-col gap-2">
              {SECTION_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-xs select-none">
                  <input
                    type="checkbox"
                    checked={sections[k]}
                    onChange={(e) =>
                      setSections((prev) => ({
                        ...prev,
                        [k]: e.target.checked,
                      }))
                    }
                  />
                  <span>{getSectionLabel(k)}</span>
                </label>
              ))}
            </div>
          </div>

          {isImport ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-foreground">
                {translator.t('settings_import_file_label')}
              </div>
              <Input
                type="file"
                accept="application/json,.json"
                disabled={isBusy}
                onChange={(e) => {
                  if (props.variant === 'import') {
                    props.onImportFileChange(e.target.files?.[0] ?? null);
                  }
                }}
                className="block w-full text-xs"
              />
              <p className="text-[0.7rem] text-muted-foreground">
                {translator.t('settings_import_file_hint')}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border/70 bg-muted/10 p-3 space-y-1">
              <p className="text-xs font-medium">{translator.t('settings_export_file_label')}</p>
              <p className="text-[0.7rem] text-muted-foreground">
                {translator.t('settings_export_file_hint')}
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onRequestClose} disabled={isBusy}>
            {translator.t('settings_dialog_cancel')}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => void onConfirm()}
            disabled={isBusy}
            className="gap-1.5"
          >
            <ConfirmIcon className="h-3.5 w-3.5" />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
