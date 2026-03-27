import { translator } from '@/infra/i18n/I18nService';

// Source of truth for the "copy template" placeholders (%Key%).
// Keep this in sync with the `values` record inside `copyText`.
export const COPY_TEXT_VALUE_KEYS = [
  {
    key: 'RouterModel',
    description: translator.t('popup_label_model'),
  },
  {
    key: 'RouterVersion',
    description: translator.t('popup_label_version'),
  },
  {
    key: 'TR069Url',
    description: translator.t('popup_label_tr069_url'),
  },
  {
    key: 'InternetStatus',
    description: translator.t('popup_label_internet_status'),
  },
  {
    key: 'TR069Status',
    description: translator.t('popup_label_tr069_status'),
  },
  {
    key: 'PPPoEUsername',
    description: translator.t('popup_label_pppoe_username'),
  },
  {
    key: 'IpVersion',
    description: translator.t('popup_label_ip_version'),
  },
  {
    key: 'LinkMode',
    description: translator.t('popup_label_link_mode'),
  },
  {
    key: 'RequestPdStatus',
    description: translator.t('popup_label_request_pd_status'),
  },
  {
    key: 'SlaacStatus',
    description: translator.t('popup_label_slaac_status_settings'),
  },
  {
    key: 'Dhcpv6Status',
    description: translator.t('popup_label_dhcpv6_status_settings'),
  },
  {
    key: 'PdStatus',
    description: translator.t('popup_label_pd_status_settings'),
  },
  {
    key: 'RemoteAccessIpv4Status',
    description: translator.t('popup_label_remote_access_ipv4_status'),
  },
  {
    key: 'RemoteAccessIpv6Status',
    description: translator.t('popup_label_remote_access_ipv6_status'),
  },
  {
    key: 'BandSteeringStatus',
    description: translator.t('popup_label_band_steering_status'),
  },
  {
    key: 'CableTotalClientsConnected',
    description: translator.t('popup_label_cable_total_clients_connected'),
  },
  {
    key: 'Wlan24Status',
    description: translator.t('popup_label_wlan24_status'),
  },
  {
    key: 'Wlan24Channel',
    description: translator.t('popup_label_wlan24_channel'),
  },
  {
    key: 'Wlan24Mode',
    description: translator.t('popup_label_wlan24_mode'),
  },
  {
    key: 'Wlan24BandWidth',
    description: translator.t('popup_label_wlan24_band_width'),
  },
  {
    key: 'Wlan24TransmittingPower',
    description: translator.t('popup_label_wlan24_transmitting_power'),
  },
  {
    key: 'Wlan24TotalClientsConnected',
    description: translator.t('popup_label_wlan24_total_clients_connected'),
  },
  {
    key: 'Wlan5Status',
    description: translator.t('popup_label_wlan5_status'),
  },
  {
    key: 'Wlan5Channel',
    description: translator.t('popup_label_wlan5_channel'),
  },
  {
    key: 'Wlan5Mode',
    description: translator.t('popup_label_wlan5_mode'),
  },
  {
    key: 'Wlan5BandWidth',
    description: translator.t('popup_label_wlan5_band_width'),
  },
  {
    key: 'Wlan5TransmittingPower',
    description: translator.t('popup_label_wlan5_transmitting_power'),
  },
  {
    key: 'Wlan5TotalClientsConnected',
    description: translator.t('popup_label_wlan5_total_clients_connected'),
  },
  {
    key: 'TotalClientsConnected',
    description: translator.t('popup_label_total_clients_connected'),
  },
  {
    key: 'DhcpStatus',
    description: translator.t('popup_label_dhcp_status'),
  },
  {
    key: 'DhcpIpAddress',
    description: translator.t('popup_label_dhcp_ip_address'),
  },
  {
    key: 'DhcpSubnetMask',
    description: translator.t('popup_label_dhcp_subnet_mask'),
  },
  {
    key: 'DhcpStartIp',
    description: translator.t('popup_label_dhcp_start_ip'),
  },
  {
    key: 'DhcpEndIp',
    description: translator.t('popup_label_dhcp_end_ip'),
  },
  {
    key: 'DhcpIspDnsStatus',
    description: translator.t('popup_label_dhcp_isp_dns_status'),
  },
  {
    key: 'DhcpPrimaryDns',
    description: translator.t('popup_label_dhcp_primary_dns'),
  },
  {
    key: 'DhcpSecondaryDns',
    description: translator.t('popup_label_dhcp_secondary_dns'),
  },
  {
    key: 'DhcpLeaseTimeMode',
    description: translator.t('popup_label_dhcp_lease_time_mode'),
  },
  {
    key: 'DhcpLeaseTime',
    description: translator.t('popup_label_dhcp_lease_time'),
  },
  {
    key: 'UpnpStatus',
    description: translator.t('popup_label_upnp_status'),
  },
  {
    key: 'LastInternalPingMessage',
    description: translator.t('popup_label_last_internal_ping_message'),
  },
  {
    key: 'LastInternalPingTime',
    description: translator.t('popup_label_last_internal_ping_time'),
  },
  {
    key: 'LastInternalPingIp',
    description: translator.t('popup_label_last_internal_ping_ip'),
  },
  {
    key: 'LastInternalPingAvgTime',
    description: translator.t('popup_label_last_internal_ping_avg_time'),
  },
  {
    key: 'LastInternalPingMinTime',
    description: translator.t('popup_label_last_internal_ping_min_time'),
  },
  {
    key: 'LastInternalPingMaxTime',
    description: translator.t('popup_label_last_internal_ping_max_time'),
  },
  {
    key: 'LastInternalPingLoss',
    description: translator.t('popup_label_last_internal_ping_loss'),
  },
  {
    key: 'LastInternalPingTransmitted',
    description: translator.t('popup_label_last_internal_ping_transmitted'),
  },
  {
    key: 'LastInternalPingReceived',
    description: translator.t('popup_label_last_internal_ping_received'),
  },
  {
    key: 'LastInternalPingMinAvgMax',
    description: translator.t('popup_label_last_internal_ping_min_avg_max'),
  },
  {
    key: 'LastExternalPingMessage',
    description: translator.t('popup_label_last_external_ping_message'),
  },
  {
    key: 'LastExternalPingTime',
    description: translator.t('popup_label_last_external_ping_time'),
  },
  {
    key: 'LastExternalPingIp',
    description: translator.t('popup_label_last_external_ping_ip'),
  },
  {
    key: 'LastExternalPingAvgTime',
    description: translator.t('popup_label_last_external_ping_avg_time'),
  },
  {
    key: 'LastExternalPingMinTime',
    description: translator.t('popup_label_last_external_ping_min_time'),
  },
  {
    key: 'LastExternalPingMaxTime',
    description: translator.t('popup_label_last_external_ping_max_time'),
  },
  {
    key: 'LastExternalPingLoss',
    description: translator.t('popup_label_last_external_ping_loss'),
  },
  {
    key: 'LastExternalPingTransmitted',
    description: translator.t('popup_label_last_external_ping_transmitted'),
  },
  {
    key: 'LastExternalPingReceived',
    description: translator.t('popup_label_last_external_ping_received'),
  },
  {
    key: 'LastExternalPingMinAvgMax',
    description: translator.t('popup_label_last_external_ping_min_avg_max'),
  },
];

export const EXPECTED_ERRORS = [
  'message channel closed before a response was received',
  'receiving end does not exist',
  'the tab was closed',
];
