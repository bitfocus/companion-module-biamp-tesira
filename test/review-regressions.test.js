import assert from 'node:assert/strict'
import test from 'node:test'
// eslint-disable-next-line n/no-unpublished-import -- tests exercise the compiled module output
import { parseRangeOverrides } from '../dist/range-overrides.js'
// eslint-disable-next-line n/no-unpublished-import -- tests exercise the compiled module output
import { detectLoginPrompt } from '../dist/login-prompt.js'
// eslint-disable-next-line n/no-unpublished-import -- tests exercise the compiled module output
import { UpgradeScripts } from '../dist/upgrades.js'
// eslint-disable-next-line n/no-unpublished-import -- tests exercise the compiled module output
import { formatConnectionStatus } from '../dist/connection-status.js'
// eslint-disable-next-line n/no-unpublished-import -- tests exercise the compiled module output
import { UpdateFeedbacks } from '../dist/feedbacks.js'
// eslint-disable-next-line n/no-unpublished-import -- tests exercise the compiled module output
import { UpdatePresets } from '../dist/presets.js'
// eslint-disable-next-line n/no-unpublished-import -- tests exercise the compiled module output
import { getTemplateById } from '../dist/protocol.js'
// eslint-disable-next-line n/no-unpublished-import -- tests exercise the compiled module output
import { scaleTesiraLevelValue, scaleTesiraMeterValue, TESIRA_METER_SCALE } from '../dist/meter-scale.js'
import ModuleInstance from '../dist/main.js'

test('parses every documented comma-separated level range override', () => {
	const ranges = parseRangeOverrides('Lobby_Level=-80:12, Podium_Level=-40:0')

	assert.deepEqual(ranges.get('Lobby_Level'), { min: -80, max: 12 })
	assert.deepEqual(ranges.get('Podium_Level'), { min: -40, max: 0 })
	assert.equal(ranges.size, 2)
})

test('ignores malformed and reversed level range overrides', () => {
	const ranges = parseRangeOverrides('MissingRange=,Reversed=12:-80,Valid=-20:5')

	assert.deepEqual([...ranges], [['Valid', { min: -20, max: 5 }]])
})

test('migrates the legacy subscription attribute into the custom attribute fields', () => {
	const action = {
		actionId: 'subscribeParameter',
		options: {
			instanceID: 'Lobby_Level',
			attribute: 'level',
			index: 1,
			customvar: 'lobby_level',
		},
	}

	const result = UpgradeScripts[0](
		{},
		{
			config: {},
			secrets: undefined,
			actions: [action],
			feedbacks: [],
		},
	)

	assert.equal(result.updatedActions.length, 1)
	assert.equal(action.actionId, 'subscribe_helper')
	assert.deepEqual(action.options, {
		instanceTag: 'Lobby_Level',
		templateId: 'custom',
		customAttribute: 'level',
		index1: '1',
		variableName: 'lobby_level',
	})
})

test('keeps the legacy unsubscribe attribute unchanged', () => {
	const action = {
		actionId: 'unsubscribeParameter',
		options: {
			attribute: 'mute',
			index: 1,
			customvar: 'lobby_mute',
		},
	}

	UpgradeScripts[0]({}, { config: {}, secrets: undefined, actions: [action], feedbacks: [] })

	assert.equal(action.actionId, 'unsubscribe_helper')
	assert.equal(action.options.attribute, 'mute')
})

test('recognizes both bare and device-prefixed Tesira login prompts', () => {
	assert.equal(detectLoginPrompt('login: '), 'username')
	assert.equal(detectLoginPrompt('HomeStudioTesira login: '), 'username')
	assert.equal(detectLoginPrompt('TesiraServerFeldmanBallRoom login: '), 'username')
	assert.equal(detectLoginPrompt('Password: '), 'password')
})

test('only recognizes login prompts at the end of the current line', () => {
	assert.equal(detectLoginPrompt('login: not a prompt'), undefined)
	assert.equal(detectLoginPrompt('Welcome to the Tesira Text Protocol Server...'), undefined)
})

test('reports all command and polling connection states', () => {
	assert.equal(formatConnectionStatus(false, false), 'Disconnected')
	assert.equal(formatConnectionStatus(true, false), 'Control connected; polling unavailable')
	assert.equal(formatConnectionStatus(false, true), 'Polling connected; control unavailable')
	assert.equal(formatConnectionStatus(true, true), 'Connected')
})

test('encodes visual feedback buffers for Companion 5 and respects wide button dimensions', async () => {
	let definitions
	const instance = {
		config: {},
		getAliases: () => [],
		getLiveAliasRange: () => undefined,
		getLiveLevelRange: () => undefined,
		getLiveMeterRange: () => undefined,
		getDynamicVariableValue: () => undefined,
		setFeedbackDefinitions: (value) => {
			definitions = value
		},
	}

	UpdateFeedbacks(instance)
	const feedback = definitions.vu_meter_vertical

	const result = await feedback.callback(
		{
			options: { source: '-20', instanceTag: '', min: -90, max: 20, padding: 2 },
			image: { width: 144, height: 58 },
		},
		{ parseVariablesInString: async (value) => value },
	)

	assert.equal(typeof result.imageBuffer, 'string')
	assert.equal(Buffer.from(result.imageBuffer, 'base64').length, 144 * 58 * 4)
	assert.deepEqual(result.imageBufferEncoding, { pixelFormat: 'ARGB' })
	assert.deepEqual(result.imageBufferPosition, { x: 0, y: 0, width: 144, height: 58 })
})

test('always publishes a numeric first-channel variable for native gauges', () => {
	const values = new Map()
	const ensuredVariables = []
	const instance = {
		dynamicVariableValues: values,
		levelVariableInstanceTags: new Map(),
		lastResponseNumeric: '',
		ensureVariable: (name) => ensuredVariables.push(name),
		updateVariables: () => undefined,
	}

	ModuleInstance.prototype.storeValueTokens.call(instance, 'meter_1', ['-30.2'], false, true)

	assert.equal(values.get('meter_1'), '-30.2')
	assert.equal(values.get('meter_1_1'), '-30.2')
	assert.equal(values.get('meter_1_scaled'), String(scaleTesiraMeterValue(-30.2)))
	assert.ok(ensuredVariables.includes('meter_1_1'))
	assert.ok(ensuredVariables.includes('meter_1_scaled'))
})

test('publishes a normalized level variable after learning the Tesira range', () => {
	const values = new Map()
	const instance = {
		dynamicVariableValues: values,
		levelVariableInstanceTags: new Map([['level_1', 'Level1']]),
		lastResponseNumeric: '',
		getLiveLevelRange: () => ({ min: -40, max: 0 }),
		ensureVariable: () => undefined,
		storeScaledLevelValue: ModuleInstance.prototype.storeScaledLevelValue,
		updateVariables: () => undefined,
	}

	ModuleInstance.prototype.storeValueTokens.call(instance, 'level_1', ['-10'], false, true)
	assert.equal(values.get('level_1_scaled'), String(scaleTesiraLevelValue(-10, -40, 0)))
})

test('publishes an initial level gauge value before live range discovery', () => {
	const values = new Map()
	const instance = {
		config: { levelRangeOverrides: 'OverrideLevel=-40:0' },
		dynamicVariableValues: values,
		getLiveLevelRange: () => undefined,
		ensureVariable: () => undefined,
	}

	ModuleInstance.prototype.storeScaledLevelValue.call(instance, 'default_level', 'DefaultLevel', '-44')
	assert.equal(values.get('default_level_scaled'), String(scaleTesiraLevelValue(-44, -100, 12)))

	ModuleInstance.prototype.storeScaledLevelValue.call(instance, 'override_level', 'OverrideLevel', '-10')
	assert.equal(values.get('override_level_scaled'), String(scaleTesiraLevelValue(-10, -40, 0)))
})

test('maps Tesira VU and peak markings onto equal visual steps', () => {
	TESIRA_METER_SCALE.forEach((db, index) => assert.equal(scaleTesiraMeterValue(db), index))
	assert.equal(scaleTesiraMeterValue('not-a-number'), 0)
	assert.equal(scaleTesiraMeterValue(-100), 0)
	assert.equal(scaleTesiraMeterValue(100), 12)
})

test('only probes live min and max bounds for level controls', () => {
	const commands = []
	const instance = {
		getLiveLevelRange: () => undefined,
		addPollingCommand: (...args) => commands.push(args),
		doPolling: () => undefined,
	}

	ModuleInstance.prototype.queueRangeProbeForInstance.call(instance, 'AudioMeter1', 'meter')
	assert.equal(commands.length, 0)

	ModuleInstance.prototype.queueRangeProbeForInstance.call(instance, 'Level1', 'level')
	assert.equal(commands.length, 2)
	assert.match(commands[0][0], /get minLevel 1$/)
	assert.match(commands[1][0], /get maxLevel 1$/)
})

test('uses scalable native gauges below image and text layers in Companion 5 presets', () => {
	let structure
	let definitions
	const instance = {
		label: 'tesira-test',
		config: {},
		getAliases: () => ['Lobby_Level', 'Lobby_Meter', 'Lobby_GainReduction', 'PeakMeter1'],
		getLiveLevelRange: () => undefined,
		getLiveMeterRange: () => undefined,
		getDynamicVariableValue: () => undefined,
		setPresetDefinitions: (sections, value) => {
			structure = sections
			definitions = value
		},
	}

	UpdatePresets(instance)

	assert.ok(structure.length > 0)
	for (const preset of Object.values(definitions)) {
		for (const step of preset.steps ?? []) {
			for (const action of [...(step.down ?? []), ...(step.up ?? [])]) {
				if (action.actionId !== 'subscribe_helper' || action.options.templateId === 'custom') continue
				assert.ok(
					getTemplateById(action.options.templateId),
					`${preset.name}: ${action.options.templateId} must be a valid subscription template`,
				)
			}
		}
	}
	const gaugePresets = Object.values(definitions).filter((preset) => preset.type === 'layered')
	assert.ok(gaugePresets.length > 0)

	for (const preset of gaugePresets) {
		const types = preset.elements.map((element) => element.type)
		const firstGauge = types.indexOf('gauge')
		const image = types.indexOf('image')
		const text = types.indexOf('text')
		assert.ok(firstGauge > types.indexOf('box'), `${preset.name}: gauge must be above background`)
		assert.ok(firstGauge < image, `${preset.name}: gauge must be below image`)
		assert.ok(image < text, `${preset.name}: image must be below text`)
		for (const gauge of preset.elements.filter((element) => element.type === 'gauge')) {
			assert.equal(gauge.value.isExpression, true)
			assert.match(gauge.value.value, /^\+\(/)
		}
		assert.equal(
			preset.feedbacks.some((feedback) => feedback.feedbackId.includes('meter')),
			false,
		)
	}

	const levelText = definitions.manual_level_meter.elements.find((element) => element.type === 'text')
	assert.equal(levelText.fontsize, 20)
	assert.equal(levelText.text.isExpression, true)
	assert.match(levelText.text.value, /toFixed\(.+, 1\)/)
	assert.match(levelText.text.value, /' dB'/)
	assert.equal(definitions.manual_refresh.style.size, '15')

	const knobLevelGauge = definitions.manual_level_rotary.elements.find((element) => element.id === 'tesira-level-gauge')
	assert.equal(knobLevelGauge.opacity, 60)
	assert.equal(knobLevelGauge.min, 0)
	assert.equal(knobLevelGauge.max, 100)
	assert.match(knobLevelGauge.value.value, /=== ''/)
	assert.match(knobLevelGauge.value.value, /manual_level_1_scaled/)
	assert.doesNotMatch(knobLevelGauge.value.value, /minLevel|maxLevel/)
	const knobVuGauge = definitions.manual_level_rotary.elements.find((element) => element.id === 'tesira-vu-gauge')
	assert.match(knobVuGauge.value.value, /manual_meter_1_scaled\)/)
	assert.doesNotMatch(knobVuGauge.value.value, /manual_meter_1_1/)
	assert.equal(knobVuGauge.min, 0)
	assert.equal(knobVuGauge.max, 12)
	assert.deepEqual(
		knobVuGauge.stops.map((stop) => stop.value),
		[0, 6, 6, 10, 10],
	)
	assert.equal(typeof knobVuGauge.stops[1].value, 'number')
	const horizontalVu = definitions.alias_vu_horizontal_Lobby_Meter.elements.find(
		(element) => element.id === 'tesira-horizontal-vu-gauge',
	)
	assert.equal(horizontalVu.orientation, 'horizontal')
	assert.match(horizontalVu.value.value, /Lobby_Meter_meter_1_scaled\)/)
	assert.doesNotMatch(horizontalVu.value.value, /Lobby_Meter_meter_1_1/)
	const peakVu = definitions.alias_vu_horizontal_PeakMeter1.elements.find(
		(element) => element.id === 'tesira-horizontal-vu-gauge',
	)
	assert.equal(peakVu.min, 0)
	assert.equal(peakVu.max, 12)
	assert.ok(structure.some((section) => section.name === '08 Horizontal VU Meters (Discovered)'))

	const knobMute = definitions.manual_level_rotary.feedbacks.find((feedback) => feedback.feedbackId === 'mute_state')
	assert.ok(knobMute)
	const backgroundOverride = knobMute.styleOverrides.find(
		(override) => override.elementId === 'tesira-background' && override.elementProperty === 'color',
	)
	assert.deepEqual(backgroundOverride.override, { isExpression: false, value: 0xb40000 })
})
