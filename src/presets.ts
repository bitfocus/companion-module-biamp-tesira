import { combineRgb, type CompanionPresetDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import { parseRangeOverrides } from './range-overrides.js'

function sanitizeVariableName(value: string): string {
	return value
		.trim()
		.replace(/[^A-Za-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '')
}

function makeTextLabel(lines: string[]): string {
	return lines.join('\\n')
}

function displayAlias(alias: string): string {
	return alias.replace(/^(LEVEL|METER)[-_ ]+/i, '').trim() || alias
}

function isRouterAlias(alias: string): boolean {
	return /(router|selector)/i.test(alias)
}

function isSelectorAlias(alias: string): boolean {
	return /selector/i.test(alias)
}

function isMultiOutputRouterAlias(alias: string): boolean {
	return /router/i.test(alias) && !isSelectorAlias(alias)
}

function isLevelControlAlias(alias: string): boolean {
	return !isRouterAlias(alias) && /(level|output|gain|master|volume|vol)/i.test(alias)
}

function moduleVariable(self: ModuleInstance, variableId: string): string {
	return `$(${self.label}:${variableId})`
}

function parsePairOverrides(raw: string): Map<string, string> {
	const map = new Map<string, string>()
	for (const entry of raw.split(',')) {
		const trimmed = entry.trim()
		if (!trimmed) continue
		const separatorIndex = trimmed.indexOf('=')
		if (separatorIndex < 1) continue
		const control = trimmed.slice(0, separatorIndex).trim()
		const meter = trimmed.slice(separatorIndex + 1).trim()
		if (control && meter) map.set(control, meter)
	}
	return map
}

function parseSourceSelectorNames(raw: string): Map<string, string[]> {
	const map = new Map<string, string[]>()
	for (const entry of raw.split(',')) {
		const trimmed = entry.trim()
		if (!trimmed) continue
		const separatorIndex = trimmed.indexOf('=')
		if (separatorIndex < 1) continue
		const tag = trimmed.slice(0, separatorIndex).trim()
		const names = trimmed
			.slice(separatorIndex + 1)
			.split('|')
			.map((name) => name.trim())
			.filter(Boolean)
		if (tag && names.length > 0) map.set(tag, names)
	}
	return map
}

function countDiscoveredValues(value: string | undefined): number {
	if (!value) return 0
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean).length
}

function aliasBaseSignature(alias: string): string {
	return alias
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
		.filter(
			(token) =>
				![
					'level',
					'meter',
					'gain',
					'output',
					'volume',
					'vol',
					'master',
					'rms',
					'peak',
					'vu',
					'audio',
					'input',
				].includes(token),
		)
		.join('_')
}

function findPairedMeterAlias(
	controlAlias: string,
	aliases: string[],
	overrideMap: Map<string, string>,
): string | undefined {
	const override = overrideMap.get(controlAlias)
	if (override) return override

	const controlSignature = aliasBaseSignature(controlAlias)
	if (!controlSignature) return undefined

	return aliases.find((candidate) => {
		if (candidate === controlAlias) return false
		if (!/(meter|rms|peak|vu)/i.test(candidate)) return false
		return aliasBaseSignature(candidate) === controlSignature
	})
}

export function UpdatePresets(self: ModuleInstance): void {
	const CONTROL_SUBSCRIPTION_RATE = '250'
	const METER_SUBSCRIPTION_RATE = '150'
	const CATEGORY_MANUAL = '01 Manual controls'
	const CATEGORY_DISCOVER = "02 Discover Instance ID's"
	const CATEGORY_SUBSCRIBE = '03 Subscribe To Instance Feedback'
	const CATEGORY_MUTE = '04 Mute Controls (Discovered)'
	const CATEGORY_LEVEL = '05 Level Controls (Discovered)'
	const CATEGORY_ROUTERS = '06 Routers (Discovered)'
	const CATEGORY_METERS = '07 VU Meters (Discovered)'
	const CATEGORY_KNOBS = '08 Knob Presets (Discovered)'
	const CATEGORY_COUGH = '09 Cough Mute (momentary mute) (Discovered)'
	const CATEGORY_TALK = '10 Talk (momentary unmute) (Discovered)'
	const CATEGORY_LATCH_TALK = '11 Latching Talk (Discovered)'
	const pairOverrides = parsePairOverrides(self.config.pairOverrides ?? '')
	const rangeOverrides = parseRangeOverrides(self.config.levelRangeOverrides ?? '')
	const sourceSelectorNames = parseSourceSelectorNames(self.config.sourceSelectorNames ?? '')
	const aliases = self.getAliases()
	const manualLevelAlias = 'InstanceTag'
	const manualMeterAlias = 'MeterTag'
	const manualGrAlias = 'GainReductionTag'
	const manualLevelLabel = displayAlias(manualLevelAlias)
	const manualMeterLabel = displayAlias(manualMeterAlias)
	const manualGrLabel = displayAlias(manualGrAlias)
	const manualLevelVar = 'manual_level_1'
	const manualMuteVar = 'manual_mute_1'
	const manualMeterVar = 'manual_meter_1'
	const manualGrVar = 'manual_gain_reduction'
	const presets: CompanionPresetDefinitions = {
		manual_refresh: {
			type: 'button',
			category: CATEGORY_MANUAL,
			name: 'Manual refresh',
			style: {
				text: makeTextLabel([manualLevelLabel, 'Refresh']),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(30, 30, 30),
				show_topbar: false,
			},
			steps: [
				{
					down: [
						{
							actionId: 'poll_once',
							options: {
								command: `${manualLevelAlias} get level 1`,
								variableName: manualLevelVar,
								roundNumericValues: false,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		},
		manual_cough: {
			type: 'button',
			category: CATEGORY_MANUAL,
			name: 'Manual cough',
			style: {
				text: makeTextLabel(['COUGH', manualLevelLabel]),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(90, 40, 0),
				show_topbar: false,
			},
			steps: [
				{
					down: [
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualLevelAlias,
								templateId: 'mute__mute',
								customAttribute: 'mute',
								index1: '1',
								index2: '',
								variableName: manualMuteVar,
								rate: CONTROL_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
						{
							actionId: 'mute_control',
							options: {
								instanceTag: manualLevelAlias,
								channel: '1',
								state: 'true',
							},
						},
					],
					up: [
						{
							actionId: 'mute_control',
							options: {
								instanceTag: manualLevelAlias,
								channel: '1',
								state: 'false',
							},
						},
					],
				},
			],
			feedbacks: [
				{
					feedbackId: 'mute_state',
					options: {
						source: moduleVariable(self, manualMuteVar),
						mutedWhen: 'true',
					},
					style: {
						bgcolor: combineRgb(180, 0, 0),
						color: combineRgb(255, 255, 255),
					},
				},
			],
		},
		manual_talk: {
			type: 'button',
			category: CATEGORY_MANUAL,
			name: 'Manual talk',
			style: {
				text: makeTextLabel(['TALK', manualLevelLabel]),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 70, 40),
				show_topbar: false,
			},
			steps: [
				{
					down: [
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualLevelAlias,
								templateId: 'mute__mute',
								customAttribute: 'mute',
								index1: '1',
								index2: '',
								variableName: manualMuteVar,
								rate: CONTROL_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
						{
							actionId: 'mute_control',
							options: {
								instanceTag: manualLevelAlias,
								channel: '1',
								state: 'false',
							},
						},
					],
					up: [
						{
							actionId: 'mute_control',
							options: {
								instanceTag: manualLevelAlias,
								channel: '1',
								state: 'true',
							},
						},
					],
				},
			],
			feedbacks: [
				{
					feedbackId: 'mute_state',
					options: {
						source: moduleVariable(self, manualMuteVar),
						mutedWhen: 'true',
					},
					style: {
						bgcolor: combineRgb(180, 0, 0),
						color: combineRgb(255, 255, 255),
					},
				},
			],
		},
		manual_talk_latch: {
			type: 'button',
			category: CATEGORY_MANUAL,
			name: 'Manual talk latch',
			style: {
				text: makeTextLabel(['TALK', 'LATCH', manualLevelLabel]),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 70, 40),
				show_topbar: false,
			},
			steps: [
				{
					down: [
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualLevelAlias,
								templateId: 'mute__mute',
								customAttribute: 'mute',
								index1: '1',
								index2: '',
								variableName: manualMuteVar,
								rate: CONTROL_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
						{
							actionId: 'mute_control',
							options: {
								instanceTag: manualLevelAlias,
								channel: '1',
								state: 'toggle',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'mute_state',
					options: {
						source: moduleVariable(self, manualMuteVar),
						mutedWhen: 'true',
					},
					style: {
						bgcolor: combineRgb(180, 0, 0),
						color: combineRgb(255, 255, 255),
					},
				},
			],
		},
		manual_mute: {
			type: 'button',
			category: CATEGORY_MANUAL,
			name: 'Manual mute',
			style: {
				text: makeTextLabel(['MUTE', manualLevelLabel]),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(40, 40, 40),
				show_topbar: false,
			},
			steps: [
				{
					down: [
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualLevelAlias,
								templateId: 'level__level',
								customAttribute: 'level',
								index1: '1',
								index2: '',
								variableName: manualLevelVar,
								rate: CONTROL_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualLevelAlias,
								templateId: 'mute__mute',
								customAttribute: 'mute',
								index1: '1',
								index2: '',
								variableName: manualMuteVar,
								rate: CONTROL_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
						{
							actionId: 'mute_control',
							options: {
								instanceTag: manualLevelAlias,
								channel: '1',
								state: 'toggle',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'mute_state',
					options: {
						source: moduleVariable(self, manualMuteVar),
						mutedWhen: 'true',
					},
					style: {
						bgcolor: combineRgb(180, 0, 0),
						color: combineRgb(255, 255, 255),
					},
				},
			],
		},
		manual_level_up: {
			type: 'button',
			category: CATEGORY_MANUAL,
			name: 'Manual level up',
			style: {
				text: makeTextLabel(['+']),
				size: '44',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 60, 110),
				show_topbar: false,
			},
			steps: [
				{
					down: [
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualLevelAlias,
								templateId: 'level__level',
								customAttribute: 'level',
								index1: '1',
								index2: '',
								variableName: manualLevelVar,
								rate: CONTROL_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
						{
							actionId: 'level_hold_start',
							options: {
								command: 'increment',
								instanceTag: manualLevelAlias,
								channel: '1',
								amount: '1',
								intervalMs: 150,
							},
						},
					],
					up: [{ actionId: 'level_hold_stop', options: {} }],
				},
			],
			feedbacks: [],
		},
		manual_level_down: {
			type: 'button',
			category: CATEGORY_MANUAL,
			name: 'Manual level down',
			style: {
				text: makeTextLabel(['-']),
				size: '44',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 60, 110),
				show_topbar: false,
			},
			steps: [
				{
					down: [
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualLevelAlias,
								templateId: 'level__level',
								customAttribute: 'level',
								index1: '1',
								index2: '',
								variableName: manualLevelVar,
								rate: CONTROL_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
						{
							actionId: 'level_hold_start',
							options: {
								command: 'decrement',
								instanceTag: manualLevelAlias,
								channel: '1',
								amount: '1',
								intervalMs: 150,
							},
						},
					],
					up: [{ actionId: 'level_hold_stop', options: {} }],
				},
			],
			feedbacks: [],
		},
		manual_level_meter: {
			type: 'button',
			category: CATEGORY_MANUAL,
			name: 'Manual level meter',
			style: {
				text: makeTextLabel([moduleVariable(self, manualLevelVar), manualLevelLabel]),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(15, 15, 15),
				show_topbar: false,
			},
			steps: [
				{
					down: [
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualLevelAlias,
								templateId: 'level__level',
								customAttribute: 'level',
								index1: '1',
								index2: '',
								variableName: manualLevelVar,
								rate: CONTROL_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualLevelAlias,
								templateId: 'mute__mute',
								customAttribute: 'mute',
								index1: '1',
								index2: '',
								variableName: manualMuteVar,
								rate: CONTROL_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualMeterAlias,
								templateId: 'audio_meter_peak_rms__level',
								customAttribute: 'level',
								index1: '1',
								index2: '',
								variableName: manualMeterVar,
								rate: METER_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'level_meter_with_right_vu',
					options: {
						sourceLevel: moduleVariable(self, manualLevelVar),
						sourceMeter: moduleVariable(self, manualMeterVar),
						levelInstanceTag: manualLevelAlias,
						meterInstanceTag: manualMeterAlias,
						levelMin: -100,
						levelMax: 12,
						meterMin: -90,
						meterMax: 20,
						padding: 2,
					},
					style: {},
				},
			],
		},
		manual_level_rotary: {
			type: 'button',
			category: CATEGORY_MANUAL,
			name: 'Manual level rotary',
			style: {
				text: makeTextLabel(['KNOB', moduleVariable(self, manualLevelVar), manualLevelLabel]),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(15, 15, 15),
				show_topbar: false,
			},
			options: {
				rotaryActions: true,
			},
			steps: [
				{
					down: [
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualLevelAlias,
								templateId: 'level__level',
								customAttribute: 'level',
								index1: '1',
								index2: '',
								variableName: manualLevelVar,
								rate: CONTROL_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualLevelAlias,
								templateId: 'mute__mute',
								customAttribute: 'mute',
								index1: '1',
								index2: '',
								variableName: manualMuteVar,
								rate: CONTROL_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualMeterAlias,
								templateId: 'audio_meter_peak_rms__level',
								customAttribute: 'level',
								index1: '1',
								index2: '',
								variableName: manualMeterVar,
								rate: METER_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
						{
							actionId: 'mute_control',
							options: {
								instanceTag: manualLevelAlias,
								channel: '1',
								state: 'toggle',
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'level_adjust',
							options: {
								command: 'decrement',
								instanceTag: manualLevelAlias,
								channel: '1',
								amount: '1',
							},
						},
					],
					rotate_right: [
						{
							actionId: 'level_adjust',
							options: {
								command: 'increment',
								instanceTag: manualLevelAlias,
								channel: '1',
								amount: '1',
							},
						},
					],
				},
			],
			feedbacks: [
				{
					feedbackId: 'mute_state',
					options: {
						source: moduleVariable(self, manualMuteVar),
						mutedWhen: 'true',
					},
					style: {
						bgcolor: combineRgb(180, 0, 0),
						color: combineRgb(255, 255, 255),
					},
				},
				{
					feedbackId: 'level_meter_with_right_vu',
					options: {
						sourceLevel: moduleVariable(self, manualLevelVar),
						sourceMeter: moduleVariable(self, manualMeterVar),
						levelInstanceTag: manualLevelAlias,
						meterInstanceTag: manualMeterAlias,
						levelMin: -100,
						levelMax: 12,
						meterMin: -90,
						meterMax: 20,
						padding: 2,
					},
					style: {},
				},
			],
		},
		manual_vu: {
			type: 'button',
			category: CATEGORY_MANUAL,
			name: 'Manual VU',
			style: {
				text: makeTextLabel([manualMeterLabel, 'VU']),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(15, 15, 15),
				show_topbar: false,
			},
			steps: [
				{
					down: [
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualMeterAlias,
								templateId: 'audio_meter_peak_rms__level',
								customAttribute: 'level',
								index1: '1',
								index2: '',
								variableName: manualMeterVar,
								rate: METER_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'vu_meter_vertical',
					options: {
						source: moduleVariable(self, manualMeterVar),
						instanceTag: manualMeterAlias,
						min: -90,
						max: 20,
						padding: 2,
					},
					style: {},
				},
			],
		},
		manual_gain_reduction: {
			type: 'button',
			category: CATEGORY_MANUAL,
			name: 'Manual gain reduction',
			style: {
				text: makeTextLabel([manualGrLabel, 'Gain Red']),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(15, 15, 15),
				show_topbar: false,
			},
			steps: [
				{
					down: [
						{
							actionId: 'subscribe_helper',
							options: {
								instanceTag: manualGrAlias,
								templateId: 'compressor_limiter__gainreduction',
								customAttribute: 'gainReduction',
								index1: '',
								index2: '',
								variableName: manualGrVar,
								rate: METER_SUBSCRIPTION_RATE,
								roundNumericValues: false,
								getInitial: true,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'gain_reduction_meter',
					options: {
						source: moduleVariable(self, manualGrVar),
						instanceTag: manualGrAlias,
						min: 0,
						max: 30,
						padding: 2,
					},
					style: {},
				},
			],
		},
	}

	presets.aliases = {
		type: 'button',
		category: CATEGORY_DISCOVER,
		name: "Discover instance ID's",
		style: {
			text: 'Get\\nTags',
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
			show_topbar: false,
		},
		steps: [
			{
				down: [{ actionId: 'session_get_aliases', options: {} }],
				up: [],
			},
		],
		feedbacks: [],
	}

	for (const alias of aliases) {
		const safeAlias = sanitizeVariableName(alias)
		const aliasLower = alias.toLowerCase()
		const aliasLabel = displayAlias(alias)
		const levelVar = `${safeAlias}_level_1`
		const muteVar = `${safeAlias}_mute_1`
		const meterVar = `${safeAlias}_meter_1`
		const grVar = `${safeAlias}_gain_reduction`
		const routerLevelListVar = `${safeAlias}_outputLevel`
		const routerMuteListVar = `${safeAlias}_outputMute`
		const routerSourceListVar = `${safeAlias}_sourceSelection`
		const pairedMeterAlias = findPairedMeterAlias(alias, aliases, pairOverrides)
		const pairedMeterVar = pairedMeterAlias ? `${sanitizeVariableName(pairedMeterAlias)}_meter_1` : meterVar
		const range = self.getLiveLevelRange(alias) ?? rangeOverrides.get(alias) ?? { min: -100, max: 12 }
		const pairedMeterRange = pairedMeterAlias
			? (self.getLiveMeterRange(pairedMeterAlias) ?? { min: -90, max: 20 })
			: { min: -90, max: 20 }
		const meterRange = self.getLiveMeterRange(alias) ?? { min: -90, max: 20 }

		const routerOutputCount = isSelectorAlias(alias)
			? 1
			: Math.max(
					countDiscoveredValues(self.getDynamicVariableValue(routerSourceListVar)),
					countDiscoveredValues(self.getDynamicVariableValue(routerLevelListVar)),
					countDiscoveredValues(self.getDynamicVariableValue(routerMuteListVar)),
					isMultiOutputRouterAlias(alias) ? 1 : 0,
				)
		const selectorNames = sourceSelectorNames.get(alias) ?? []

		presets[`alias_refresh_${safeAlias}`] = {
			type: 'button',
			category: CATEGORY_SUBSCRIBE,
			name: `${alias} refresh`,
			style: {
				text: makeTextLabel([aliasLabel, 'Refresh']),
				size: '14',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(140, 0, 0),
				show_topbar: false,
			},
			steps: [
				{
					down: [
						{
							actionId: 'poll_once',
							options: {
								command: isRouterAlias(alias)
									? isSelectorAlias(alias)
										? `${alias} get sourceSelection 1`
										: `${alias} get sourceSelection`
									: `${alias} get level 1`,
								variableName: isRouterAlias(alias)
									? isSelectorAlias(alias)
										? `${routerSourceListVar}_1`
										: routerSourceListVar
									: levelVar,
								roundNumericValues: false,
							},
						},
						...(isRouterAlias(alias)
							? [
									{
										actionId: 'poll_once',
										options: {
											command: isSelectorAlias(alias) ? `${alias} get outputLevel 1` : `${alias} get outputLevel`,
											variableName: isSelectorAlias(alias) ? `${routerLevelListVar}_1` : routerLevelListVar,
											roundNumericValues: false,
										},
									},
									{
										actionId: 'poll_once',
										options: {
											command: isSelectorAlias(alias) ? `${alias} get outputMute 1` : `${alias} get outputMute`,
											variableName: isSelectorAlias(alias) ? `${routerMuteListVar}_1` : routerMuteListVar,
											roundNumericValues: false,
										},
									},
								]
							: []),
					],
					up: [],
				},
			],
			feedbacks: [],
		}

		if (isLevelControlAlias(alias)) {
			presets[`alias_cough_${safeAlias}`] = {
				type: 'button',
				category: CATEGORY_COUGH,
				name: `${alias} cough`,
				style: {
					text: makeTextLabel(['COUGH', aliasLabel]),
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(90, 40, 0),
					show_topbar: false,
				},
				steps: [
					{
						down: [
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'mute__mute',
									customAttribute: 'mute',
									index1: '1',
									index2: '',
									variableName: muteVar,
									rate: CONTROL_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
							{
								actionId: 'mute_control',
								options: {
									instanceTag: alias,
									channel: '1',
									state: 'true',
								},
							},
						],
						up: [
							{
								actionId: 'mute_control',
								options: {
									instanceTag: alias,
									channel: '1',
									state: 'false',
								},
							},
						],
					},
				],
				feedbacks: [
					{
						feedbackId: 'mute_state',
						options: {
							source: moduleVariable(self, muteVar),
							mutedWhen: 'true',
						},
						style: {
							bgcolor: combineRgb(180, 0, 0),
							color: combineRgb(255, 255, 255),
						},
					},
				],
			}

			presets[`alias_talk_${safeAlias}`] = {
				type: 'button',
				category: CATEGORY_TALK,
				name: `${alias} talk`,
				style: {
					text: makeTextLabel(['TALK', aliasLabel]),
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 70, 40),
					show_topbar: false,
				},
				steps: [
					{
						down: [
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'mute__mute',
									customAttribute: 'mute',
									index1: '1',
									index2: '',
									variableName: muteVar,
									rate: CONTROL_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
							{
								actionId: 'mute_control',
								options: {
									instanceTag: alias,
									channel: '1',
									state: 'false',
								},
							},
						],
						up: [
							{
								actionId: 'mute_control',
								options: {
									instanceTag: alias,
									channel: '1',
									state: 'true',
								},
							},
						],
					},
				],
				feedbacks: [
					{
						feedbackId: 'mute_state',
						options: {
							source: moduleVariable(self, muteVar),
							mutedWhen: 'true',
						},
						style: {
							bgcolor: combineRgb(180, 0, 0),
							color: combineRgb(255, 255, 255),
						},
					},
				],
			}

			presets[`alias_talk_latch_${safeAlias}`] = {
				type: 'button',
				category: CATEGORY_LATCH_TALK,
				name: `${alias} talk latch`,
				style: {
					text: makeTextLabel(['TALK', 'LATCH', aliasLabel]),
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 70, 40),
					show_topbar: false,
				},
				steps: [
					{
						down: [
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'mute__mute',
									customAttribute: 'mute',
									index1: '1',
									index2: '',
									variableName: muteVar,
									rate: CONTROL_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
							{
								actionId: 'mute_control',
								options: {
									instanceTag: alias,
									channel: '1',
									state: 'toggle',
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'mute_state',
						options: {
							source: moduleVariable(self, muteVar),
							mutedWhen: 'true',
						},
						style: {
							bgcolor: combineRgb(180, 0, 0),
							color: combineRgb(255, 255, 255),
						},
					},
				],
			}

			presets[`alias_mute_${safeAlias}`] = {
				type: 'button',
				category: CATEGORY_MUTE,
				name: `${alias} mute`,
				style: {
					text: makeTextLabel(['MUTE', aliasLabel]),
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(40, 40, 40),
					show_topbar: false,
				},
				steps: [
					{
						down: [
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'level__level',
									customAttribute: 'level',
									index1: '1',
									index2: '',
									variableName: levelVar,
									rate: CONTROL_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'mute__mute',
									customAttribute: 'mute',
									index1: '1',
									index2: '',
									variableName: muteVar,
									rate: CONTROL_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
							{
								actionId: 'mute_control',
								options: {
									instanceTag: alias,
									channel: '1',
									state: 'toggle',
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'mute_state',
						options: {
							source: moduleVariable(self, muteVar),
							mutedWhen: 'true',
						},
						style: {
							bgcolor: combineRgb(180, 0, 0),
							color: combineRgb(255, 255, 255),
						},
					},
				],
			}

			presets[`alias_level_up_${safeAlias}`] = {
				type: 'button',
				category: CATEGORY_LEVEL,
				name: `${alias} level up`,
				style: {
					text: makeTextLabel(['+']),
					size: '44',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 60, 110),
					show_topbar: false,
				},
				steps: [
					{
						down: [
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'level__level',
									customAttribute: 'level',
									index1: '1',
									index2: '',
									variableName: levelVar,
									rate: CONTROL_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
							{
								actionId: 'level_hold_start',
								options: {
									command: 'increment',
									instanceTag: alias,
									channel: '1',
									amount: '1',
									intervalMs: 150,
								},
							},
						],
						up: [{ actionId: 'level_hold_stop', options: {} }],
					},
				],
				feedbacks: [],
			}

			presets[`alias_level_down_${safeAlias}`] = {
				type: 'button',
				category: CATEGORY_LEVEL,
				name: `${alias} level down`,
				style: {
					text: makeTextLabel(['-']),
					size: '44',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 60, 110),
					show_topbar: false,
				},
				steps: [
					{
						down: [
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'level__level',
									customAttribute: 'level',
									index1: '1',
									index2: '',
									variableName: levelVar,
									rate: CONTROL_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
							{
								actionId: 'level_hold_start',
								options: {
									command: 'decrement',
									instanceTag: alias,
									channel: '1',
									amount: '1',
									intervalMs: 150,
								},
							},
						],
						up: [{ actionId: 'level_hold_stop', options: {} }],
					},
				],
				feedbacks: [],
			}

			presets[`alias_level_meter_${safeAlias}`] = {
				type: 'button',
				category: CATEGORY_LEVEL,
				name: `${alias} level meter`,
				style: {
					text: makeTextLabel([moduleVariable(self, levelVar), aliasLabel]),
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(15, 15, 15),
					show_topbar: false,
				},
				steps: [
					{
						down: [
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'level__level',
									customAttribute: 'level',
									index1: '1',
									index2: '',
									variableName: levelVar,
									rate: CONTROL_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'mute__mute',
									customAttribute: 'mute',
									index1: '1',
									index2: '',
									variableName: muteVar,
									rate: CONTROL_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
							...(pairedMeterAlias
								? [
										{
											actionId: 'subscribe_helper',
											options: {
												instanceTag: pairedMeterAlias,
												templateId: 'audio_meter_peak_rms__level',
												customAttribute: 'level',
												index1: '1',
												index2: '',
												variableName: pairedMeterVar,
												rate: METER_SUBSCRIPTION_RATE,
												roundNumericValues: false,
												getInitial: true,
											},
										},
									]
								: []),
						],
						up: [],
					},
				],
				feedbacks: [
					...(pairedMeterAlias
						? [
								{
									feedbackId: 'level_meter_with_right_vu',
									options: {
										sourceLevel: moduleVariable(self, levelVar),
										sourceMeter: moduleVariable(self, pairedMeterVar),
										levelInstanceTag: alias,
										meterInstanceTag: pairedMeterAlias,
										levelMin: range.min,
										levelMax: range.max,
										meterMin: pairedMeterRange.min,
										meterMax: pairedMeterRange.max,
										padding: 2,
									},
									style: {},
								},
							]
						: [
								{
									feedbackId: 'level_meter_horizontal',
									options: {
										source: moduleVariable(self, levelVar),
										instanceTag: alias,
										min: range.min,
										max: range.max,
										padding: 2,
									},
									style: {},
								},
							]),
				],
			}

			presets[`alias_level_rotary_${safeAlias}`] = {
				type: 'button',
				category: CATEGORY_KNOBS,
				name: `${alias} level rotary`,
				style: {
					text: makeTextLabel(['KNOB', moduleVariable(self, levelVar), aliasLabel]),
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(15, 15, 15),
					show_topbar: false,
				},
				options: {
					rotaryActions: true,
				},
				steps: [
					{
						down: [
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'level__level',
									customAttribute: 'level',
									index1: '1',
									index2: '',
									variableName: levelVar,
									rate: CONTROL_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'mute__mute',
									customAttribute: 'mute',
									index1: '1',
									index2: '',
									variableName: muteVar,
									rate: CONTROL_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
							...(pairedMeterAlias
								? [
										{
											actionId: 'subscribe_helper',
											options: {
												instanceTag: pairedMeterAlias,
												templateId: 'audio_meter_peak_rms__level',
												customAttribute: 'level',
												index1: '1',
												index2: '',
												variableName: pairedMeterVar,
												rate: METER_SUBSCRIPTION_RATE,
												roundNumericValues: false,
												getInitial: true,
											},
										},
									]
								: []),
							{
								actionId: 'mute_control',
								options: {
									instanceTag: alias,
									channel: '1',
									state: 'toggle',
								},
							},
						],
						up: [],
						rotate_left: [
							{
								actionId: 'level_adjust',
								options: {
									command: 'decrement',
									instanceTag: alias,
									channel: '1',
									amount: '1',
								},
							},
						],
						rotate_right: [
							{
								actionId: 'level_adjust',
								options: {
									command: 'increment',
									instanceTag: alias,
									channel: '1',
									amount: '1',
								},
							},
						],
					},
				],
				feedbacks: [
					{
						feedbackId: 'mute_state',
						options: {
							source: moduleVariable(self, muteVar),
							mutedWhen: 'true',
						},
						style: {
							bgcolor: combineRgb(180, 0, 0),
							color: combineRgb(255, 255, 255),
						},
					},
					...(pairedMeterAlias
						? [
								{
									feedbackId: 'level_meter_with_right_vu',
									options: {
										sourceLevel: moduleVariable(self, levelVar),
										sourceMeter: moduleVariable(self, pairedMeterVar),
										levelInstanceTag: alias,
										meterInstanceTag: pairedMeterAlias,
										levelMin: range.min,
										levelMax: range.max,
										meterMin: pairedMeterRange.min,
										meterMax: pairedMeterRange.max,
										padding: 2,
									},
									style: {},
								},
							]
						: [
								{
									feedbackId: 'level_meter_horizontal',
									options: {
										source: moduleVariable(self, levelVar),
										instanceTag: alias,
										min: range.min,
										max: range.max,
										padding: 2,
									},
									style: {},
								},
							]),
				],
			}
		}

		if (isRouterAlias(alias)) {
			for (let outputIndex = 1; outputIndex <= routerOutputCount; outputIndex++) {
				const routerLevelVar = `${routerLevelListVar}_${outputIndex}`
				const routerMuteVar = `${routerMuteListVar}_${outputIndex}`
				const routerSourceVar = `${routerSourceListVar}_${outputIndex}`
				const outputLabel = routerOutputCount > 1 ? `OUT ${outputIndex}` : aliasLabel
				const outputSuffix = routerOutputCount > 1 ? `_out_${outputIndex}` : ''

				presets[`alias_router_status_${safeAlias}${outputSuffix}`] = {
					type: 'button',
					category: CATEGORY_ROUTERS,
					name: `${alias} router status ${outputIndex}`,
					style: {
						text: makeTextLabel([
							outputLabel,
							`SRC ${moduleVariable(self, routerSourceVar)}`,
							moduleVariable(self, routerLevelVar),
						]),
						size: '14',
						color: combineRgb(255, 255, 255),
						bgcolor: combineRgb(15, 15, 15),
						show_topbar: false,
					},
					steps: [
						{
							down: [
								{
									actionId: 'subscribe_helper',
									options: {
										instanceTag: alias,
										templateId: 'source_selector__sourceselection',
										customAttribute: 'sourceSelection',
										index1: String(outputIndex),
										index2: '',
										variableName: routerSourceVar,
										rate: CONTROL_SUBSCRIPTION_RATE,
										roundNumericValues: false,
										getInitial: true,
									},
								},
								{
									actionId: 'subscribe_helper',
									options: {
										instanceTag: alias,
										templateId: 'source_selector__outputlevel',
										customAttribute: 'outputLevel',
										index1: String(outputIndex),
										index2: '',
										variableName: routerLevelVar,
										rate: CONTROL_SUBSCRIPTION_RATE,
										roundNumericValues: false,
										getInitial: true,
									},
								},
								{
									actionId: 'subscribe_helper',
									options: {
										instanceTag: alias,
										templateId: 'source_selector__outputmute',
										customAttribute: 'outputMute',
										index1: String(outputIndex),
										index2: '',
										variableName: routerMuteVar,
										rate: CONTROL_SUBSCRIPTION_RATE,
										roundNumericValues: false,
										getInitial: true,
									},
								},
							],
							up: [],
						},
					],
					feedbacks: [
						{
							feedbackId: 'mute_state',
							options: {
								source: moduleVariable(self, routerMuteVar),
								mutedWhen: 'true',
							},
							style: {
								bgcolor: combineRgb(180, 0, 0),
								color: combineRgb(255, 255, 255),
							},
						},
						{
							feedbackId: 'level_meter_horizontal',
							options: {
								source: moduleVariable(self, routerLevelVar),
								instanceTag: alias,
								min: range.min,
								max: range.max,
								padding: 2,
							},
							style: {},
						},
					],
				}

				presets[`alias_router_mute_${safeAlias}${outputSuffix}`] = {
					type: 'button',
					category: CATEGORY_ROUTERS,
					name: `${alias} router mute ${outputIndex}`,
					style: {
						text: makeTextLabel(['MUTE', outputLabel]),
						size: '14',
						color: combineRgb(255, 255, 255),
						bgcolor: combineRgb(40, 40, 40),
						show_topbar: false,
					},
					steps: [
						{
							down: [
								{
									actionId: 'subscribe_helper',
									options: {
										instanceTag: alias,
										templateId: 'source_selector__outputlevel',
										customAttribute: 'outputLevel',
										index1: String(outputIndex),
										index2: '',
										variableName: routerLevelVar,
										rate: CONTROL_SUBSCRIPTION_RATE,
										roundNumericValues: false,
										getInitial: true,
									},
								},
								{
									actionId: 'subscribe_helper',
									options: {
										instanceTag: alias,
										templateId: 'source_selector__outputmute',
										customAttribute: 'outputMute',
										index1: String(outputIndex),
										index2: '',
										variableName: routerMuteVar,
										rate: CONTROL_SUBSCRIPTION_RATE,
										roundNumericValues: false,
										getInitial: true,
									},
								},
								{
									actionId: 'ttp_command',
									options: {
										instanceTag: alias,
										command: 'toggle',
										attribute: 'outputMute',
										index1: String(outputIndex),
										index2: '',
										value: '',
									},
								},
							],
							up: [],
						},
					],
					feedbacks: [
						{
							feedbackId: 'mute_state',
							options: {
								source: moduleVariable(self, routerMuteVar),
								mutedWhen: 'true',
							},
							style: {
								bgcolor: combineRgb(180, 0, 0),
								color: combineRgb(255, 255, 255),
							},
						},
					],
				}

				presets[`alias_router_level_up_${safeAlias}${outputSuffix}`] = {
					type: 'button',
					category: CATEGORY_ROUTERS,
					name: `${alias} router level up ${outputIndex}`,
					style: {
						text: makeTextLabel(['+']),
						size: '44',
						color: combineRgb(255, 255, 255),
						bgcolor: combineRgb(0, 60, 110),
						show_topbar: false,
					},
					steps: [
						{
							down: [
								{
									actionId: 'subscribe_helper',
									options: {
										instanceTag: alias,
										templateId: 'source_selector__outputlevel',
										customAttribute: 'outputLevel',
										index1: String(outputIndex),
										index2: '',
										variableName: routerLevelVar,
										rate: CONTROL_SUBSCRIPTION_RATE,
										roundNumericValues: false,
										getInitial: true,
									},
								},
								{
									actionId: 'ttp_command',
									options: {
										instanceTag: alias,
										command: 'increment',
										attribute: 'outputLevel',
										index1: String(outputIndex),
										index2: '',
										value: '1',
									},
								},
							],
							up: [],
						},
					],
					feedbacks: [],
				}

				presets[`alias_router_level_down_${safeAlias}${outputSuffix}`] = {
					type: 'button',
					category: CATEGORY_ROUTERS,
					name: `${alias} router level down ${outputIndex}`,
					style: {
						text: makeTextLabel(['-']),
						size: '44',
						color: combineRgb(255, 255, 255),
						bgcolor: combineRgb(0, 60, 110),
						show_topbar: false,
					},
					steps: [
						{
							down: [
								{
									actionId: 'subscribe_helper',
									options: {
										instanceTag: alias,
										templateId: 'source_selector__outputlevel',
										customAttribute: 'outputLevel',
										index1: String(outputIndex),
										index2: '',
										variableName: routerLevelVar,
										rate: CONTROL_SUBSCRIPTION_RATE,
										roundNumericValues: false,
										getInitial: true,
									},
								},
								{
									actionId: 'ttp_command',
									options: {
										instanceTag: alias,
										command: 'decrement',
										attribute: 'outputLevel',
										index1: String(outputIndex),
										index2: '',
										value: '1',
									},
								},
							],
							up: [],
						},
					],
					feedbacks: [],
				}
			}

			if (isSelectorAlias(alias)) {
				for (const [index, sourceName] of selectorNames.entries()) {
					const sourceNumber = String(index + 1)
					const routerSourceVar = `${routerSourceListVar}_1`

					presets[`alias_selector_source_${safeAlias}_${sourceNumber}`] = {
						type: 'button',
						category: CATEGORY_ROUTERS,
						name: `${alias} source ${sourceNumber}`,
						style: {
							text: makeTextLabel([sourceName, aliasLabel]),
							size: '14',
							color: combineRgb(255, 255, 255),
							bgcolor: combineRgb(25, 25, 25),
							show_topbar: false,
						},
						steps: [
							{
								down: [
									{
										actionId: 'subscribe_helper',
										options: {
											instanceTag: alias,
											templateId: 'source_selector__sourceselection',
											customAttribute: 'sourceSelection',
											index1: '1',
											index2: '',
											variableName: routerSourceVar,
											rate: CONTROL_SUBSCRIPTION_RATE,
											roundNumericValues: false,
											getInitial: true,
										},
									},
									{
										actionId: 'source_select',
										options: {
											instanceTag: alias,
											output: '1',
											source: sourceNumber,
										},
									},
								],
								up: [],
							},
						],
						feedbacks: [
							{
								feedbackId: 'numeric_compare',
								options: {
									source: moduleVariable(self, routerSourceVar),
									comparator: 'eq',
									expected: index + 1,
								},
								style: {
									bgcolor: combineRgb(0, 120, 0),
									color: combineRgb(255, 255, 255),
								},
							},
						],
					}
				}
			}
		}

		if (/(meter|rms|peak)/i.test(aliasLower)) {
			presets[`alias_vu_${safeAlias}`] = {
				type: 'button',
				category: CATEGORY_METERS,
				name: `${alias} VU`,
				style: {
					text: makeTextLabel([aliasLabel, 'VU']),
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(15, 15, 15),
					show_topbar: false,
				},
				steps: [
					{
						down: [
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'audio_meter_peak_rms__level',
									customAttribute: 'level',
									index1: '1',
									index2: '',
									variableName: meterVar,
									rate: METER_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'vu_meter_vertical',
						options: {
							source: moduleVariable(self, meterVar),
							instanceTag: alias,
							min: meterRange.min,
							max: meterRange.max,
							padding: 2,
						},
						style: {},
					},
				],
			}
		}

		if (/(compress|comp|limit|leveler|gate)/i.test(aliasLower)) {
			presets[`alias_gr_${safeAlias}`] = {
				type: 'button',
				category: CATEGORY_METERS,
				name: `${alias} gain reduction`,
				style: {
					text: makeTextLabel([aliasLabel, 'Gain Red']),
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(15, 15, 15),
					show_topbar: false,
				},
				steps: [
					{
						down: [
							{
								actionId: 'subscribe_helper',
								options: {
									instanceTag: alias,
									templateId: 'compressor_limiter__gainreduction',
									customAttribute: 'gainReduction',
									index1: '',
									index2: '',
									variableName: grVar,
									rate: METER_SUBSCRIPTION_RATE,
									roundNumericValues: false,
									getInitial: true,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'gain_reduction_meter',
						options: {
							source: moduleVariable(self, grVar),
							instanceTag: alias,
							min: 0,
							max: 30,
							padding: 2,
						},
						style: {},
					},
				],
			}
		}
	}

	self.setPresetDefinitions(presets)
}
