import type { JsonObject, SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig extends JsonObject {
	host: string
	port: number
	loginUsername: string
	pollingInterval: number
	defaultSubscriptionRate: number
	autoFetchAliases: boolean
	logResponses: boolean
	startupControlSubscriptions: string
	startupMeterSubscriptions: string
	pairOverrides: string
	levelRangeOverrides: string
	sourceSelectorNames: string
}

export interface ModuleSecrets extends JsonObject {
	loginPassword: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Tesira host',
			width: 8,
			default: '',
			tooltip: 'IP address or hostname of the Tesira server.',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 23,
			tooltip: 'Tesira Text Protocol telnet port.',
		},
		{
			type: 'textinput',
			id: 'loginUsername',
			label: 'Login username',
			width: 6,
			default: 'default',
			tooltip:
				'Username sent if the Tesira Text Protocol server prompts for login. Unprotected systems use default/default.',
		},
		{
			type: 'secret-text',
			id: 'loginPassword',
			label: 'Login password',
			width: 6,
			default: 'default',
			tooltip: 'Password sent if the Tesira Text Protocol server prompts for login. Stored as a Companion secret.',
		},
		{
			type: 'number',
			id: 'pollingInterval',
			label: 'Polling interval (ms)',
			width: 6,
			min: 250,
			max: 60000,
			default: 1000,
			tooltip: 'How often recurring GET commands are sent on the polling socket.',
		},
		{
			type: 'number',
			id: 'defaultSubscriptionRate',
			label: 'Default subscription rate (ms)',
			width: 6,
			min: 0,
			max: 60000,
			default: 1000,
			tooltip: 'Used by the helper subscription actions when a rate is not provided.',
		},
		{
			type: 'checkbox',
			id: 'autoFetchAliases',
			label: 'Fetch instance tags after connect',
			width: 6,
			default: true,
			tooltip:
				'Automatically runs SESSION get aliases after the Tesira welcome banner is received. Tesira Text Protocol calls these aliases. Discovery can take about 30 seconds on larger systems.',
		},
		{
			type: 'checkbox',
			id: 'logResponses',
			label: 'Debug Logging',
			width: 6,
			default: false,
			tooltip: 'Log parsed Tesira responses for troubleshooting.',
		},
		{
			type: 'textinput',
			id: 'startupControlSubscriptions',
			label: 'Always subscribe these level control instance tags',
			width: 12,
			default: '',
			tooltip:
				'Comma-separated level block instance tags. On connect the module will subscribe to level 1 and mute 1 for each tag at 250 ms so feedback is ready immediately. Example: LEVEL-LECTERN,LEVEL-PC.',
		},
		{
			type: 'textinput',
			id: 'startupMeterSubscriptions',
			label: 'Always subscribe these VU meter instance tags',
			width: 12,
			default: '',
			tooltip:
				'Comma-separated meter block instance tags. On connect the module will subscribe to level 1 for each tag at 150 ms so paired VU feedback is already live. Example: METER-LECTERN,METER-PC.',
		},
		{
			type: 'textinput',
			id: 'pairOverrides',
			label: 'Control to meter pairing overrides',
			width: 12,
			default: '',
			tooltip: 'Comma-separated control=meter pairs. Example: Lobby_Level=Lobby_Meter,RoomA_Output=RoomA_RMS.',
		},
		{
			type: 'textinput',
			id: 'levelRangeOverrides',
			label: 'Level range overrides',
			width: 12,
			default: '',
			tooltip:
				'Comma-separated tag=min:max entries. Use this when the Biamp level block range is not the default. Example: Lobby_Level=-80:12,Podium_Level=-40:0.',
		},
		{
			type: 'textinput',
			id: 'sourceSelectorNames',
			label: 'Source selector names',
			width: 12,
			default: '',
			tooltip:
				'Comma-separated selector=name|name|name entries. Generates discovered source-select buttons for single-output source selectors. Example: SRCSEL-Room=PC|Lectern|Wireless.',
		},
	]
}
