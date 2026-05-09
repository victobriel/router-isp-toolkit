import { HuaweiCommonSelectors } from '@/infra/drivers/huawei/shared/HuaweiCommonSelectors';

export const HuaweiK562E10Selectors = {
  ...HuaweiCommonSelectors,

  username: '#txtUserName, input[type="text"]',
  password: '#txtPassword, input[type="password"]',
  submit: '#loginbutton',

  indexPage: '#indexPage',
} as const;
