import { HuaweiCommonSelectors } from '../shared/HuaweiCommonSelectors';

export const HuaweiEG8145V5Selectors = {
  ...HuaweiCommonSelectors,

  username: '#txt_Username, input[name="txt_Username"]',
  password: '#txt_Password, input[name="txt_Password"]',
  submit: '#loginbutton, input[type="button"]',

  // UPNP
  advUpnpEnabled: 'input#Enable[type="checkbox"]',

  // TR-069
  advTr069Enabled: 'input#EnableCWMP[type="checkbox"]',
  advTr069Url: 'input#URL[type="text"]',
} as const;
