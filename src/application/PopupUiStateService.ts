import { LAST_DATA_STORAGE_KEY, UI_STATE_STORAGE_KEY } from '@/application/constants/index';
import type { IStorage } from '@/application/ports/IStorage';
import type { PopupStatusType } from '@/application/types/index';
import type { ExtractionResult } from '@/domain/schemas/validation';
import { defaultSessionStorageService } from '@/infra/storage/SessionStorageService';

export interface PopupStatusState {
  type: PopupStatusType;
  text: string;
}

export interface PopupLogEntry {
  msg: string;
  type: PopupStatusType;
  time: string;
}

export interface PopupUiState {
  status: PopupStatusState;
  logs: PopupLogEntry[];
}

export class PopupUiStateService {
  constructor(private readonly storage: IStorage) {}

  private tabKey(baseKey: string, tabId: number | null): string | null {
    if (tabId === null) return null;
    return `${baseKey}:${String(tabId)}`;
  }

  public async loadUiState(tabId: number | null): Promise<PopupUiState | null> {
    const key = this.tabKey(UI_STATE_STORAGE_KEY, tabId);
    if (key === null) return null;

    const raw = await this.storage.get<{
      status?: Partial<PopupStatusState>;
      logs?: Array<Partial<PopupLogEntry>>;
    }>(key);
    if (!raw) return null;

    const status: PopupStatusState | null =
      raw.status && raw.status.type !== undefined && typeof raw.status.text === 'string'
        ? { type: raw.status.type, text: raw.status.text }
        : null;

    const logs: PopupLogEntry[] = Array.isArray(raw.logs)
      ? raw.logs
          .filter(
            (log) =>
              typeof log?.msg === 'string' &&
              log.type !== undefined &&
              typeof log.time === 'string',
          )
          .map((log) => ({
            msg: log.msg as string,
            type: log.type as PopupStatusType,
            time: log.time as string,
          }))
          .slice(0, 50)
      : [];

    if (!status && logs.length === 0) return null;

    return {
      status:
        status ??
        ({
          type: 'none',
          text: '',
        } as unknown as PopupStatusState),
      logs,
    };
  }

  public async saveUiState(tabId: number | null, state: PopupUiState): Promise<void> {
    const key = this.tabKey(UI_STATE_STORAGE_KEY, tabId);
    if (key === null) return;
    await this.storage.save(
      key,
      {
        status: state.status,
        logs: state.logs,
      },
      24 * 60 * 1000,
    );
  }

  public async loadLastExtraction(tabId: number | null): Promise<ExtractionResult | null> {
    const key = this.tabKey(LAST_DATA_STORAGE_KEY, tabId);
    if (key === null) return null;
    return await this.storage.get<ExtractionResult>(key);
  }

  public async saveLastExtraction(tabId: number | null, data: ExtractionResult): Promise<void> {
    const key = this.tabKey(LAST_DATA_STORAGE_KEY, tabId);
    if (key === null) return;
    await this.storage.save(key, data, 24 * 60 * 1000);
  }
}

export const defaultPopupUiStateService = new PopupUiStateService(defaultSessionStorageService);
