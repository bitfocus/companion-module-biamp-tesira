import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import { SUBSCRIPTION_TEMPLATE_CHOICES, getTemplateById } from './protocol.js'

function isBlank(value: unknown): boolean {
	return typeof value !== 'string' || value.trim() === ''
}

function buildCommandParts(...parts: Array<string | undefined>): string {
	return parts
		.filter((part) => !isBlank(part))
		.join(' ')
		.trim()
}

const optionTooltips: Record<string, string> = {
	presetId: 'Numeric Tesira preset ID to recall. Variables are supported.',
	instanceTag: 'Tesira block instance tag or alias, for example Level1 or Room_Output.',
	channel: 'Tesira channel or index argument, usually 1 for mono level and mute blocks.',
	level: 'Level in dB, or the adjustment amount for increment/decrement commands.',
	amount: 'Increment or decrement amount in dB.',
	input: 'Tesira input index argument.',
	output: 'Tesira output index argument.',
	source: 'Source selection number or index.',
	attribute: 'Tesira Text Protocol attribute name, such as level, mute, or crosspointLevel.',
	customAttribute: 'Custom Tesira Text Protocol attribute used when the selected template is Custom.',
	index1: 'First optional Tesira index argument.',
	index2: 'Second optional Tesira index argument. Leave blank when the command does not need it.',
	value: 'Value sent for set commands. Leave blank for get or toggle commands.',
	command: 'Tesira Text Protocol command or command mode for this action.',
	variableName: 'Companion variable name or Tesira publishToken used to store the result.',
	rate: 'Minimum subscription update interval in milliseconds.',
	intervalMs: 'Repeat interval in milliseconds for held level adjustments.',
}

function applyOptionTooltips(actions: CompanionActionDefinitions): void {
	for (const action of Object.values(actions)) {
		if (!action) continue
		for (const option of action.options ?? []) {
			const mutableOption = option as { id?: string; tooltip?: string }
			if (mutableOption.id && !mutableOption.tooltip && optionTooltips[mutableOption.id]) {
				mutableOption.tooltip = optionTooltips[mutableOption.id]
			}
		}
	}
}

export function UpdateActions(self: ModuleInstance): void {
	const actions: CompanionActionDefinitions = {
		recall_preset: {
			name: 'Recall preset',
			options: [
				{
					id: 'presetId',
					type: 'textinput',
					label: 'Preset ID',
					default: '1001',
					useVariables: true,
				},
			],
			callback: async (action) => {
				const presetId = (await self.parseVariablesInString(String(action.options.presetId ?? ''))).trim()
				if (!presetId) throw new Error('Preset ID is required')
				self.sendCommand(`DEVICE recallPreset ${presetId}`)
			},
		},
		session_get_aliases: {
			name: 'Refresh instance tags',
			options: [],
			callback: async () => {
				self.sendCommand('SESSION get aliases')
			},
		},
		level_set: {
			name: 'Set level',
			options: [
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance tag',
					default: 'Level1',
					useVariables: true,
				},
				{
					id: 'channel',
					type: 'textinput',
					label: 'Channel / index',
					default: '1',
					useVariables: true,
				},
				{
					id: 'level',
					type: 'textinput',
					label: 'Level (dB)',
					default: '0',
					useVariables: true,
				},
			],
			callback: async (action) => {
				const instanceTag = (await self.parseVariablesInString(String(action.options.instanceTag ?? ''))).trim()
				const channel = (await self.parseVariablesInString(String(action.options.channel ?? ''))).trim()
				const level = (await self.parseVariablesInString(String(action.options.level ?? ''))).trim()
				self.sendCommand(buildCommandParts(instanceTag, 'set', 'level', channel, level))
			},
		},
		level_adjust: {
			name: 'Increment or decrement level',
			options: [
				{
					id: 'command',
					type: 'dropdown',
					label: 'Command',
					default: 'increment',
					choices: [
						{ id: 'increment', label: 'Increment' },
						{ id: 'decrement', label: 'Decrement' },
					],
				},
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance tag',
					default: 'Level1',
					useVariables: true,
				},
				{
					id: 'channel',
					type: 'textinput',
					label: 'Channel / index',
					default: '1',
					useVariables: true,
				},
				{
					id: 'amount',
					type: 'textinput',
					label: 'Amount',
					default: '1',
					useVariables: true,
				},
			],
			callback: async (action) => {
				const instanceTag = (await self.parseVariablesInString(String(action.options.instanceTag ?? ''))).trim()
				const channel = (await self.parseVariablesInString(String(action.options.channel ?? ''))).trim()
				const amount = (await self.parseVariablesInString(String(action.options.amount ?? ''))).trim()
				self.sendCommand(
					buildCommandParts(instanceTag, String(action.options.command ?? 'increment'), 'level', channel, amount),
				)
			},
		},
		level_hold_start: {
			name: 'Start hold level adjustment',
			options: [
				{
					id: 'command',
					type: 'dropdown',
					label: 'Direction',
					default: 'increment',
					choices: [
						{ id: 'increment', label: 'Increase' },
						{ id: 'decrement', label: 'Decrease' },
					],
				},
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance tag',
					default: 'Level1',
					useVariables: true,
				},
				{
					id: 'channel',
					type: 'textinput',
					label: 'Channel / index',
					default: '1',
					useVariables: true,
				},
				{
					id: 'amount',
					type: 'textinput',
					label: 'Amount per repeat',
					default: '1',
					useVariables: true,
				},
				{
					id: 'intervalMs',
					type: 'number',
					label: 'Repeat interval (ms)',
					default: 150,
					min: 50,
					max: 5000,
				},
			],
			callback: async (action) => {
				const instanceTag = (await self.parseVariablesInString(String(action.options.instanceTag ?? ''))).trim()
				const channel = (await self.parseVariablesInString(String(action.options.channel ?? ''))).trim()
				const amount = (await self.parseVariablesInString(String(action.options.amount ?? ''))).trim()
				const command = String(action.options.command ?? 'increment') === 'decrement' ? 'decrement' : 'increment'
				self.startLevelHold(instanceTag, channel, command, amount, Number(action.options.intervalMs ?? 150))
			},
		},
		level_hold_stop: {
			name: 'Stop hold level adjustment',
			options: [],
			callback: async () => {
				self.stopLevelHold()
			},
		},
		mute_control: {
			name: 'Mute, unmute, or toggle',
			options: [
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance tag',
					default: 'Level1',
					useVariables: true,
				},
				{
					id: 'channel',
					type: 'textinput',
					label: 'Channel / index',
					default: '1',
					useVariables: true,
				},
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					default: 'toggle',
					choices: [
						{ id: 'true', label: 'Mute' },
						{ id: 'false', label: 'Unmute' },
						{ id: 'toggle', label: 'Toggle' },
					],
				},
			],
			callback: async (action) => {
				const instanceTag = (await self.parseVariablesInString(String(action.options.instanceTag ?? ''))).trim()
				const channel = (await self.parseVariablesInString(String(action.options.channel ?? ''))).trim()
				const state = String(action.options.state ?? 'toggle')
				if (state === 'toggle') {
					self.sendCommand(buildCommandParts(instanceTag, 'toggle', 'mute', channel))
				} else {
					self.sendCommand(buildCommandParts(instanceTag, 'set', 'mute', channel, state))
				}
			},
		},
		source_select: {
			name: 'Select source',
			options: [
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance tag',
					default: 'SourceSelector1',
					useVariables: true,
				},
				{
					id: 'output',
					type: 'textinput',
					label: 'Output / index',
					default: '1',
					useVariables: true,
				},
				{
					id: 'source',
					type: 'textinput',
					label: 'Source number',
					default: '1',
					useVariables: true,
				},
			],
			callback: async (action) => {
				const instanceTag = (await self.parseVariablesInString(String(action.options.instanceTag ?? ''))).trim()
				const output = (await self.parseVariablesInString(String(action.options.output ?? ''))).trim()
				const source = (await self.parseVariablesInString(String(action.options.source ?? ''))).trim()
				if (!instanceTag || !output || !source) throw new Error('Instance tag, output, and source are required')
				self.sendCommand(buildCommandParts(instanceTag, 'set', 'sourceSelection', output, source))
			},
		},
		matrix_crosspoint: {
			name: 'Matrix crosspoint on / off / toggle / query',
			options: [
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Matrix mixer instance tag',
					default: 'Mixer1',
					useVariables: true,
				},
				{
					id: 'input',
					type: 'textinput',
					label: 'Input',
					default: '1',
					useVariables: true,
				},
				{
					id: 'output',
					type: 'textinput',
					label: 'Output',
					default: '1',
					useVariables: true,
				},
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					default: 'true',
					choices: [
						{ id: 'true', label: 'On' },
						{ id: 'false', label: 'Off' },
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'get', label: 'Query current state' },
					],
				},
			],
			callback: async (action) => {
				const instanceTag = (await self.parseVariablesInString(String(action.options.instanceTag ?? ''))).trim()
				const input = (await self.parseVariablesInString(String(action.options.input ?? ''))).trim()
				const output = (await self.parseVariablesInString(String(action.options.output ?? ''))).trim()
				const state = String(action.options.state ?? 'true')
				if (!instanceTag || !input || !output) throw new Error('Instance tag, input, and output are required')

				if (state === 'toggle' || state === 'get') {
					self.sendCommand(buildCommandParts(instanceTag, state, 'crosspoint', input, output))
				} else {
					self.sendCommand(buildCommandParts(instanceTag, 'set', 'crosspoint', input, output, state))
				}
			},
		},
		matrix_crosspoint_level: {
			name: 'Matrix crosspoint level set / adjust / query',
			options: [
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Matrix mixer instance tag',
					default: 'Mixer1',
					useVariables: true,
				},
				{
					id: 'input',
					type: 'textinput',
					label: 'Input',
					default: '1',
					useVariables: true,
				},
				{
					id: 'output',
					type: 'textinput',
					label: 'Output',
					default: '1',
					useVariables: true,
				},
				{
					id: 'command',
					type: 'dropdown',
					label: 'Command',
					default: 'set',
					choices: [
						{ id: 'set', label: 'Set' },
						{ id: 'increment', label: 'Increment' },
						{ id: 'decrement', label: 'Decrement' },
						{ id: 'get', label: 'Query current level' },
					],
				},
				{
					id: 'level',
					type: 'textinput',
					label: 'Level / amount (dB)',
					default: '0',
					useVariables: true,
					isVisible: (options) => options.command !== 'get',
				},
			],
			callback: async (action) => {
				const instanceTag = (await self.parseVariablesInString(String(action.options.instanceTag ?? ''))).trim()
				const input = (await self.parseVariablesInString(String(action.options.input ?? ''))).trim()
				const output = (await self.parseVariablesInString(String(action.options.output ?? ''))).trim()
				const command = String(action.options.command ?? 'set')
				const level = (await self.parseVariablesInString(String(action.options.level ?? ''))).trim()
				if (!instanceTag || !input || !output) throw new Error('Instance tag, input, and output are required')
				if (command !== 'get' && !level) throw new Error('Level / amount is required')

				self.sendCommand(
					buildCommandParts(
						instanceTag,
						command,
						'crosspointLevel',
						input,
						output,
						command === 'get' ? undefined : level,
					),
				)
			},
		},
		ttp_command: {
			name: 'Custom Tesira command builder',
			options: [
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance tag',
					default: 'Level1',
					useVariables: true,
				},
				{
					id: 'command',
					type: 'dropdown',
					label: 'Command',
					default: 'get',
					choices: [
						{ id: 'get', label: 'get' },
						{ id: 'set', label: 'set' },
						{ id: 'increment', label: 'increment' },
						{ id: 'decrement', label: 'decrement' },
						{ id: 'toggle', label: 'toggle' },
					],
				},
				{
					id: 'attribute',
					type: 'textinput',
					label: 'Attribute',
					default: 'level',
					useVariables: true,
				},
				{
					id: 'index1',
					type: 'textinput',
					label: 'Index 1',
					default: '1',
					useVariables: true,
				},
				{
					id: 'index2',
					type: 'textinput',
					label: 'Index 2',
					default: '',
					useVariables: true,
				},
				{
					id: 'value',
					type: 'textinput',
					label: 'Value',
					default: '',
					useVariables: true,
				},
			],
			callback: async (action) => {
				const instanceTag = (await self.parseVariablesInString(String(action.options.instanceTag ?? ''))).trim()
				const attribute = (await self.parseVariablesInString(String(action.options.attribute ?? ''))).trim()
				const index1 = (await self.parseVariablesInString(String(action.options.index1 ?? ''))).trim()
				const index2 = (await self.parseVariablesInString(String(action.options.index2 ?? ''))).trim()
				const value = (await self.parseVariablesInString(String(action.options.value ?? ''))).trim()
				const command = String(action.options.command ?? 'get')
				const finalCommand = buildCommandParts(instanceTag, command, attribute, index1, index2, value)
				self.sendCommand(finalCommand)
			},
		},
		raw_command: {
			name: 'Custom raw Tesira command',
			options: [
				{
					id: 'command',
					type: 'textinput',
					label: 'Command',
					default: 'SESSION get aliases',
					useVariables: true,
				},
				{
					id: 'roundNumericSubscriptions',
					type: 'checkbox',
					label: 'Round numeric subscription values if this raw command is a subscribe',
					default: false,
				},
			],
			callback: async (action) => {
				const command = (await self.parseVariablesInString(String(action.options.command ?? ''))).trim()
				if (!command) throw new Error('Command cannot be empty')
				self.trackRawSubscriptionCommand(command, Boolean(action.options.roundNumericSubscriptions))
				self.sendCommand(command)
			},
		},
		subscribe_helper: {
			name: 'Custom attribute subscription',
			options: [
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance tag',
					default: 'AudioMeter1',
					useVariables: true,
				},
				{
					id: 'templateId',
					type: 'dropdown',
					label: 'Subscription template',
					default: 'audio_meter_peak_rms__level',
					choices: SUBSCRIPTION_TEMPLATE_CHOICES,
				},
				{
					id: 'customAttribute',
					type: 'textinput',
					label: 'Custom attribute',
					default: 'level',
					useVariables: true,
					isVisible: (options) => options.templateId === 'custom',
				},
				{
					id: 'index1',
					type: 'textinput',
					label: 'Index 1',
					default: '1',
					useVariables: true,
				},
				{
					id: 'index2',
					type: 'textinput',
					label: 'Index 2',
					default: '',
					useVariables: true,
				},
				{
					id: 'variableName',
					type: 'textinput',
					label: 'Variable / publishToken',
					default: 'meter_ch1',
				},
				{
					id: 'rate',
					type: 'textinput',
					label: 'Rate (ms)',
					default: '1000',
					useVariables: true,
				},
				{
					id: 'roundNumericValues',
					type: 'checkbox',
					label: 'Round numeric values',
					default: false,
				},
				{
					id: 'getInitial',
					type: 'checkbox',
					label: 'Queue initial GET after subscribing',
					default: true,
				},
			],
			callback: async (action) => {
				const instanceTag = (await self.parseVariablesInString(String(action.options.instanceTag ?? ''))).trim()
				const templateId = String(action.options.templateId ?? 'custom')
				const template = getTemplateById(templateId)
				const customAttribute = (await self.parseVariablesInString(String(action.options.customAttribute ?? ''))).trim()
				const attribute = template?.attribute ?? customAttribute
				const index1 = (await self.parseVariablesInString(String(action.options.index1 ?? ''))).trim()
				const index2 = (await self.parseVariablesInString(String(action.options.index2 ?? ''))).trim()
				const variableName = String(action.options.variableName ?? '').trim()
				const resolvedRate = (await self.parseVariablesInString(String(action.options.rate ?? ''))).trim()
				const rate = resolvedRate || String(self.config.defaultSubscriptionRate ?? 500)
				if (!instanceTag || !attribute || !variableName) {
					throw new Error('Instance tag, attribute, and variable name are required')
				}
				self.subscribeToAttribute({
					instanceTag,
					attribute,
					index1,
					index2,
					variableName,
					rate,
					roundNumericValues: Boolean(action.options.roundNumericValues),
					getInitial: Boolean(action.options.getInitial),
				})
			},
		},
		unsubscribe_helper: {
			name: 'Custom attribute unsubscribe',
			options: [
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance tag',
					default: 'AudioMeter1',
					useVariables: true,
				},
				{
					id: 'attribute',
					type: 'textinput',
					label: 'Attribute',
					default: 'level',
					useVariables: true,
				},
				{
					id: 'index1',
					type: 'textinput',
					label: 'Index 1',
					default: '1',
					useVariables: true,
				},
				{
					id: 'index2',
					type: 'textinput',
					label: 'Index 2',
					default: '',
					useVariables: true,
				},
				{
					id: 'variableName',
					type: 'textinput',
					label: 'Variable / publishToken',
					default: 'meter_ch1',
				},
			],
			callback: async (action) => {
				const instanceTag = (await self.parseVariablesInString(String(action.options.instanceTag ?? ''))).trim()
				const attribute = (await self.parseVariablesInString(String(action.options.attribute ?? ''))).trim()
				const index1 = (await self.parseVariablesInString(String(action.options.index1 ?? ''))).trim()
				const index2 = (await self.parseVariablesInString(String(action.options.index2 ?? ''))).trim()
				const variableName = String(action.options.variableName ?? '').trim()
				if (!variableName) throw new Error('Variable name is required')
				self.unsubscribeFromAttribute({ instanceTag, attribute, index1, index2, variableName })
			},
		},
		poll_add: {
			name: 'Add custom recurring GET polling',
			options: [
				{
					id: 'command',
					type: 'textinput',
					label: 'GET command',
					default: 'AudioMeter1 get level 1',
					useVariables: true,
				},
				{
					id: 'variableName',
					type: 'textinput',
					label: 'Variable name',
					default: 'polled_level',
				},
				{
					id: 'roundNumericValues',
					type: 'checkbox',
					label: 'Round numeric values',
					default: false,
				},
			],
			callback: async (action) => {
				const command = (await self.parseVariablesInString(String(action.options.command ?? ''))).trim()
				const variableName = String(action.options.variableName ?? '').trim()
				self.addPollingCommand(command, variableName, Boolean(action.options.roundNumericValues), false)
			},
		},
		poll_once: {
			name: 'Queue custom one-shot GET polling',
			options: [
				{
					id: 'command',
					type: 'textinput',
					label: 'GET command',
					default: 'AudioMeter1 get level 1',
					useVariables: true,
				},
				{
					id: 'variableName',
					type: 'textinput',
					label: 'Variable name',
					default: 'polled_level_once',
				},
				{
					id: 'roundNumericValues',
					type: 'checkbox',
					label: 'Round numeric values',
					default: false,
				},
			],
			callback: async (action) => {
				const command = (await self.parseVariablesInString(String(action.options.command ?? ''))).trim()
				const variableName = String(action.options.variableName ?? '').trim()
				self.addPollingCommand(command, variableName, Boolean(action.options.roundNumericValues), true)
			},
		},
		poll_remove: {
			name: 'Remove custom recurring GET polling',
			options: [
				{
					id: 'variableName',
					type: 'textinput',
					label: 'Variable name',
					default: 'polled_level',
				},
			],
			callback: async (action) => {
				self.removePollingCommand(String(action.options.variableName ?? '').trim())
			},
		},
	}

	applyOptionTooltips(actions)
	self.setActionDefinitions(actions)
}
