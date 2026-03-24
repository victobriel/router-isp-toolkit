/** Common 20 MHz center channels for 5 GHz (UNII / DFS / extended). */
export const WLAN5_80MHZ_CHANNELS: string[] = [
  'Auto',
  '36',
  '40',
  '44',
  '48',
  '52',
  '56',
  '60',
  '64',
  '100',
  '104',
  '108',
  '112',
  '116',
  '120',
  '124',
  '128',
  '149',
  '153',
  '157',
  '161',
];

export const WLAN_TRANSMITTING_POWER_OPTIONS = ['100%', '80%', '60%', '40%', '20%'] as const;
export const WLAN_TRANSMITTING_POWER_VALUE_SET = new Set(WLAN_TRANSMITTING_POWER_OPTIONS);

export const UNSELECTED_MODEL_VALUE = '_unselected';
export const DISABLED_VALUE = '_disabled';

export const BOOL_ENABLED_VALUE = 'enabled';
export const BOOL_DISABLED_VALUE = 'disabled';

export const WLAN24_CHANNEL_ACCEPTABLE = Array.from({ length: 13 }, (_, i) => String(i + 1)).concat(
  ['Auto'],
);

export const WLAN24_BAND_WIDTH = ['Auto', '20MHz', '40MHz'] as const;
export const WLAN5_BAND_WIDTH = ['Auto', '20MHz', '40MHz', '80MHz', '160MHz'] as const;
