import { combineRgb, type CompanionFeedbackContext, type CompanionFeedbackDefinitions } from '@companion-module/base'
import { graphics } from 'companion-module-utils'
import type { ModuleInstance } from './main.js'

type MeterMode = 'vertical-bottom-up' | 'vertical-top-down' | 'horizontal-left-right'

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

function parseResolvedNumber(value: string): number | undefined {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : undefined
}

async function resolveNumber(context: CompanionFeedbackContext, source: unknown): Promise<number | undefined> {
	const resolved = await context.parseVariablesInString(typeof source === 'string' ? source : '')
	return parseResolvedNumber(resolved.trim())
}

async function resolveText(context: CompanionFeedbackContext, source: unknown): Promise<string> {
	return (await context.parseVariablesInString(typeof source === 'string' ? source : '')).trim()
}

function resolveImageSize(image: { width: number; height: number } | undefined): { width: number; height: number } {
	return {
		width: image?.width ?? 72,
		height: image?.height ?? 72,
	}
}

function normalizedMeterValue(value: number | undefined, min: number, max: number): number {
	if (value === undefined || max <= min) return 0
	return clamp(((value - min) / (max - min)) * 100, 0, 100)
}

function resolveColorValue(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function sanitizeAliasToken(value: string): string {
	return value
		.trim()
		.replace(/[^A-Za-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '')
}

function extractVariableId(source: unknown): string | undefined {
	if (typeof source !== 'string') return undefined
	const match = source.trim().match(/^\$\([^)]+:([A-Za-z0-9_]+)\)$/)
	return match?.[1]
}

function readRangeFromVariables(
	self: ModuleInstance,
	alias: string | undefined,
): { min: number; max: number } | undefined {
	if (!alias) return undefined
	const base = sanitizeAliasToken(alias)
	const minRaw = self.getDynamicVariableValue(`${base}_minLevel_1`)
	const maxRaw = self.getDynamicVariableValue(`${base}_maxLevel_1`)
	const min = minRaw !== undefined ? Number.parseFloat(minRaw) : Number.NaN
	const max = maxRaw !== undefined ? Number.parseFloat(maxRaw) : Number.NaN
	if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return undefined
	return { min, max }
}

function parseRangeOverrides(raw: string): Map<string, { min: number; max: number }> {
	const ranges = new Map<string, { min: number; max: number }>()
	for (const entry of raw.split(/[\n;]/)) {
		const trimmed = entry.trim()
		if (!trimmed) continue
		const [aliasPart, rangePart] = trimmed.split('=')
		if (!aliasPart || !rangePart) continue
		const [minPart, maxPart] = rangePart.split(':')
		const min = Number(minPart)
		const max = Number(maxPart)
		if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) continue
		ranges.set(aliasPart.trim(), { min, max })
	}
	return ranges
}

function readRangeOverride(self: ModuleInstance, alias: string | undefined): { min: number; max: number } | undefined {
	if (!alias) return undefined
	return parseRangeOverrides(self.config.levelRangeOverrides ?? '').get(alias)
}

function inferAliasFromSource(
	self: ModuleInstance,
	explicitInstanceTag: unknown,
	source: unknown,
	suffix: string,
): string | undefined {
	if (typeof explicitInstanceTag === 'string' && explicitInstanceTag.trim()) {
		return explicitInstanceTag.trim()
	}

	const variableId = extractVariableId(source)
	if (!variableId) return undefined

	return self.getAliases().find((alias) => `${sanitizeAliasToken(alias)}_${suffix}` === variableId)
}

function resolveLevelRange(
	self: ModuleInstance,
	explicitInstanceTag: unknown,
	source: unknown,
	minValue: unknown,
	maxValue: unknown,
): { min: number; max: number } {
	const alias = inferAliasFromSource(self, explicitInstanceTag, source, 'level_1')
	return (
		(alias
			? (self.getLiveLevelRange(alias) ??
				self.getLiveAliasRange(alias) ??
				readRangeFromVariables(self, alias) ??
				readRangeOverride(self, alias))
			: undefined) ?? {
			min: Number(minValue ?? -100),
			max: Number(maxValue ?? 12),
		}
	)
}

function resolveMeterRange(
	self: ModuleInstance,
	explicitInstanceTag: unknown,
	source: unknown,
	minValue: unknown,
	maxValue: unknown,
): { min: number; max: number } {
	const alias = inferAliasFromSource(self, explicitInstanceTag, source, 'meter_1')
	return (
		(alias
			? (self.getLiveMeterRange(alias) ??
				self.getLiveAliasRange(alias) ??
				readRangeFromVariables(self, alias) ??
				readRangeOverride(self, alias))
			: undefined) ?? {
			min: Number(minValue ?? -90),
			max: Number(maxValue ?? 20),
		}
	)
}

function resolveGenericRange(
	self: ModuleInstance,
	explicitInstanceTag: unknown,
	source: unknown,
	minValue: unknown,
	maxValue: unknown,
): { min: number; max: number } {
	const alias =
		typeof explicitInstanceTag === 'string' && explicitInstanceTag.trim()
			? explicitInstanceTag.trim()
			: (inferAliasFromSource(self, undefined, source, 'level_1') ??
				inferAliasFromSource(self, undefined, source, 'meter_1'))
	return (
		(alias
			? (self.getLiveAliasRange(alias) ??
				self.getLiveLevelRange(alias) ??
				self.getLiveMeterRange(alias) ??
				readRangeFromVariables(self, alias) ??
				readRangeOverride(self, alias))
			: undefined) ?? {
			min: Number(minValue ?? -90),
			max: Number(maxValue ?? 20),
		}
	)
}

function buildHorizontalLevelMeterImage(
	width: number,
	height: number,
	value: number,
	padding: number,
	color: number,
): Buffer {
	return buildMeterImage(width, height, value, 'horizontal-left-right', padding, [
		{
			size: 100,
			color,
			background: color,
			backgroundOpacity: 48,
		},
	])
}

function buildMeterImage(
	width: number,
	height: number,
	value: number,
	mode: MeterMode,
	padding: number,
	colors: Array<{ size: number; color: number; background: number; backgroundOpacity: number }>,
): Buffer {
	const innerWidth = Math.max(2, width - padding * 2)
	const innerHeight = Math.max(2, height - padding * 2)
	const isVertical = mode !== 'horizontal-left-right'
	const barLength = isVertical ? innerHeight : innerWidth
	const barWidth = isVertical ? Math.max(4, Math.floor(innerWidth)) : Math.max(4, Math.floor(innerHeight))

	const options = {
		width,
		height,
		colors,
		barLength,
		barWidth,
		type: isVertical ? 'vertical' : 'horizontal',
		value: clamp(value, 0, 100),
		offsetX: padding,
		offsetY: padding,
		opacity: 255,
		reverse: mode === 'vertical-top-down',
	}

	return graphics.bar(options)
}

function buildSideVuMeterImage(
	width: number,
	height: number,
	value: number,
	padding: number,
	side: 'left' | 'right',
): Buffer {
	const barWidth = 6
	const meterHeight = Math.max(8, height - padding * 2)
	const offsetX = side === 'left' ? padding : Math.max(padding, width - barWidth - padding)
	const offsetY = padding

	return graphics.bar({
		width,
		height,
		colors: [
			{ size: 72, color: combineRgb(0, 180, 70), background: combineRgb(0, 180, 70), backgroundOpacity: 48 },
			{ size: 20, color: combineRgb(255, 190, 0), background: combineRgb(255, 190, 0), backgroundOpacity: 48 },
			{ size: 8, color: combineRgb(220, 40, 20), background: combineRgb(220, 40, 20), backgroundOpacity: 48 },
		],
		barLength: meterHeight,
		barWidth,
		type: 'vertical',
		value: clamp(value, 0, 100),
		offsetX,
		offsetY,
		opacity: 255,
	})
}

function buildSideGainReductionMeterImage(
	width: number,
	height: number,
	value: number,
	padding: number,
	side: 'left' | 'right',
): Buffer {
	const barWidth = 3
	const gap = 1
	const vuBarWidth = 6
	const meterHeight = Math.max(8, height - padding * 2)
	const offsetX =
		side === 'left' ? padding + vuBarWidth + gap : Math.max(padding, width - vuBarWidth - gap - barWidth - padding)
	const offsetY = padding

	return graphics.bar({
		width,
		height,
		colors: [{ size: 100, color: combineRgb(220, 30, 30), background: combineRgb(220, 30, 30), backgroundOpacity: 48 }],
		barLength: meterHeight,
		barWidth,
		type: 'vertical',
		value: clamp(value, 0, 100),
		offsetX,
		offsetY,
		opacity: 255,
		reverse: true,
	})
}

type UnifiedMeterLayout =
	| 'vu_full'
	| 'vu_left'
	| 'vu_right'
	| 'vu_left_gr'
	| 'vu_right_gr'
	| 'level_only'
	| 'level_left_vu'
	| 'level_right_vu'
	| 'level_left_vu_gr'
	| 'level_right_vu_gr'
	| 'stereo_vu'
	| 'stereo_vu_dual_gr'

function buildUnifiedMeterBuffers(
	layout: UnifiedMeterLayout,
	width: number,
	height: number,
	padding: number,
	levelValue: number,
	levelColor: number,
	vuValue: number,
	leftVuValue: number,
	rightVuValue: number,
	grValue: number,
	leftGrValue: number,
	rightGrValue: number,
): Buffer[] {
	const buffers: Buffer[] = []

	switch (layout) {
		case 'vu_full':
			buffers.push(
				buildMeterImage(width, height, vuValue, 'vertical-bottom-up', padding, [
					{ size: 72, color: combineRgb(0, 180, 70), background: combineRgb(0, 180, 70), backgroundOpacity: 48 },
					{ size: 20, color: combineRgb(255, 190, 0), background: combineRgb(255, 190, 0), backgroundOpacity: 48 },
					{ size: 8, color: combineRgb(220, 40, 20), background: combineRgb(220, 40, 20), backgroundOpacity: 48 },
				]),
			)
			break
		case 'vu_left':
			buffers.push(buildSideVuMeterImage(width, height, vuValue, padding, 'left'))
			break
		case 'vu_right':
			buffers.push(buildSideVuMeterImage(width, height, vuValue, padding, 'right'))
			break
		case 'vu_left_gr':
			buffers.push(buildSideVuMeterImage(width, height, vuValue, padding, 'left'))
			buffers.push(buildSideGainReductionMeterImage(width, height, grValue, padding, 'left'))
			break
		case 'vu_right_gr':
			buffers.push(buildSideVuMeterImage(width, height, vuValue, padding, 'right'))
			buffers.push(buildSideGainReductionMeterImage(width, height, grValue, padding, 'right'))
			break
		case 'level_only':
			buffers.push(buildHorizontalLevelMeterImage(width, height, levelValue, padding, levelColor))
			break
		case 'level_left_vu':
			buffers.push(buildHorizontalLevelMeterImage(width, height, levelValue, padding, levelColor))
			buffers.push(buildSideVuMeterImage(width, height, vuValue, padding, 'left'))
			break
		case 'level_right_vu':
			buffers.push(buildHorizontalLevelMeterImage(width, height, levelValue, padding, levelColor))
			buffers.push(buildSideVuMeterImage(width, height, vuValue, padding, 'right'))
			break
		case 'level_left_vu_gr':
			buffers.push(buildHorizontalLevelMeterImage(width, height, levelValue, padding, levelColor))
			buffers.push(buildSideVuMeterImage(width, height, vuValue, padding, 'left'))
			buffers.push(buildSideGainReductionMeterImage(width, height, grValue, padding, 'left'))
			break
		case 'level_right_vu_gr':
			buffers.push(buildHorizontalLevelMeterImage(width, height, levelValue, padding, levelColor))
			buffers.push(buildSideVuMeterImage(width, height, vuValue, padding, 'right'))
			buffers.push(buildSideGainReductionMeterImage(width, height, grValue, padding, 'right'))
			break
		case 'stereo_vu':
			buffers.push(buildSideVuMeterImage(width, height, leftVuValue, padding, 'left'))
			buffers.push(buildSideVuMeterImage(width, height, rightVuValue, padding, 'right'))
			break
		case 'stereo_vu_dual_gr':
			buffers.push(buildSideVuMeterImage(width, height, leftVuValue, padding, 'left'))
			buffers.push(buildSideVuMeterImage(width, height, rightVuValue, padding, 'right'))
			buffers.push(buildSideGainReductionMeterImage(width, height, leftGrValue, padding, 'left'))
			buffers.push(buildSideGainReductionMeterImage(width, height, rightGrValue, padding, 'right'))
			break
	}

	return buffers
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const feedbacks: CompanionFeedbackDefinitions = {
		connected: {
			name: 'Connected to Tesira',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 120, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [],
			callback: () => self.isReady,
		},
		numeric_compare: {
			name: 'Numeric value matches condition',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 90, 140),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'textinput',
					label: 'Value or variable',
					default: '$(biamp-tesira:last_response_numeric)',
					useVariables: true,
				},
				{
					id: 'comparator',
					type: 'dropdown',
					label: 'Comparison',
					default: 'gt',
					choices: [
						{ id: 'eq', label: '=' },
						{ id: 'ne', label: '!=' },
						{ id: 'gt', label: '>' },
						{ id: 'gte', label: '>=' },
						{ id: 'lt', label: '<' },
						{ id: 'lte', label: '<=' },
					],
				},
				{
					id: 'expected',
					type: 'number',
					label: 'Expected value',
					default: 0,
					min: -1000,
					max: 1000,
				},
			],
			callback: async (feedback, context) => {
				const actual = await resolveNumber(context, feedback.options.source)
				if (actual === undefined) return false
				const expected = Number(feedback.options.expected ?? 0)
				switch (String(feedback.options.comparator ?? 'gt')) {
					case 'eq':
						return actual === expected
					case 'ne':
						return actual !== expected
					case 'gte':
						return actual >= expected
					case 'lt':
						return actual < expected
					case 'lte':
						return actual <= expected
					case 'gt':
					default:
						return actual > expected
				}
			},
		},
		text_match: {
			name: 'Text value matches',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(120, 50, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'textinput',
					label: 'Value or variable',
					default: '$(biamp-tesira:last_response)',
					useVariables: true,
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Match mode',
					default: 'contains',
					choices: [
						{ id: 'equals', label: 'Equals' },
						{ id: 'contains', label: 'Contains' },
						{ id: 'startsWith', label: 'Starts with' },
					],
				},
				{
					id: 'expected',
					type: 'textinput',
					label: 'Expected text',
					default: 'true',
					useVariables: true,
				},
				{
					id: 'ignoreCase',
					type: 'checkbox',
					label: 'Ignore case',
					default: true,
				},
			],
			callback: async (feedback, context) => {
				let source = await context.parseVariablesInString(String(feedback.options.source ?? ''))
				let expected = await context.parseVariablesInString(String(feedback.options.expected ?? ''))
				if (feedback.options.ignoreCase) {
					source = source.toLowerCase()
					expected = expected.toLowerCase()
				}
				switch (String(feedback.options.mode ?? 'contains')) {
					case 'equals':
						return source === expected
					case 'startsWith':
						return source.startsWith(expected)
					case 'contains':
					default:
						return source.includes(expected)
				}
			},
		},
		mute_state: {
			name: 'Mute state',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(180, 0, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'textinput',
					label: 'Value or variable',
					default: '$(biamp-tesira:mute_ch1)',
					useVariables: true,
				},
				{
					id: 'mutedWhen',
					type: 'dropdown',
					label: 'Muted when value is',
					default: 'true',
					choices: [
						{ id: 'true', label: 'true' },
						{ id: 'false', label: 'false' },
					],
				},
			],
			callback: async (feedback, context) => {
				const source = (await context.parseVariablesInString(String(feedback.options.source ?? '')))
					.trim()
					.toLowerCase()
				return source === String(feedback.options.mutedWhen ?? 'true').toLowerCase()
			},
		},
		feature_state: {
			name: 'Feature state',
			type: 'boolean',
			description: 'Matches on or off style values for features such as AEC enable.',
			defaultStyle: {
				bgcolor: combineRgb(0, 120, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'textinput',
					label: 'Value or variable',
					default: '$(biamp-tesira:last_response)',
					useVariables: true,
				},
				{
					id: 'activeValues',
					type: 'textinput',
					label: 'Active values (comma separated)',
					default: 'true,on,enabled,enable,1',
					useVariables: true,
				},
				{
					id: 'ignoreCase',
					type: 'checkbox',
					label: 'Ignore case',
					default: true,
				},
			],
			callback: async (feedback, context) => {
				const ignoreCase = Boolean(feedback.options.ignoreCase)
				const source = await resolveText(context, feedback.options.source)
				const activeValues = (await resolveText(context, feedback.options.activeValues))
					.split(',')
					.map((value) => value.trim())
					.filter(Boolean)

				const normalizedSource = ignoreCase ? source.toLowerCase() : source
				return activeValues.some((value) => (ignoreCase ? value.toLowerCase() : value) === normalizedSource)
			},
		},
		numeric_range: {
			name: 'Numeric value in range',
			type: 'boolean',
			description: 'Highlights when a numeric value is within the configured range, useful for NR or NLP amounts.',
			defaultStyle: {
				bgcolor: combineRgb(0, 90, 140),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'source',
					type: 'textinput',
					label: 'Value or variable',
					default: '$(biamp-tesira:last_response_numeric)',
					useVariables: true,
				},
				{
					id: 'min',
					type: 'number',
					label: 'Minimum',
					default: 0,
					min: -200,
					max: 200,
				},
				{
					id: 'max',
					type: 'number',
					label: 'Maximum',
					default: 10,
					min: -200,
					max: 200,
				},
				{
					id: 'inclusiveMin',
					type: 'checkbox',
					label: 'Include minimum',
					default: true,
				},
				{
					id: 'inclusiveMax',
					type: 'checkbox',
					label: 'Include maximum',
					default: true,
				},
			],
			callback: async (feedback, context) => {
				const actual = await resolveNumber(context, feedback.options.source)
				if (actual === undefined) return false

				const min = Number(feedback.options.min ?? 0)
				const max = Number(feedback.options.max ?? 10)
				const minOk = feedback.options.inclusiveMin ? actual >= min : actual > min
				const maxOk = feedback.options.inclusiveMax ? actual <= max : actual < max
				return minOk && maxOk
			},
		},
		vu_meter_vertical: {
			name: 'Meter - VU Meter - Full Button',
			type: 'advanced',
			description: 'Bottom-to-top multi-colour meter for level variables.',
			options: [
				{
					id: 'source',
					type: 'textinput',
					label: 'Value or variable',
					default: '$(biamp-tesira:meter_ch1)',
					useVariables: true,
				},
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance ID for live range',
					default: '',
				},
				{
					id: 'min',
					type: 'number',
					label: 'Minimum dB',
					default: -90,
					min: -200,
					max: 100,
				},
				{
					id: 'max',
					type: 'number',
					label: 'Maximum dB',
					default: 20,
					min: -200,
					max: 100,
				},
				{
					id: 'padding',
					type: 'number',
					label: 'Padding',
					default: 2,
					min: 0,
					max: 20,
				},
				{
					id: 'color',
					type: 'colorpicker',
					label: 'Meter color',
					default: combineRgb(40, 150, 255),
				},
			],
			callback: async (feedback, context) => {
				const value = await resolveNumber(context, feedback.options.source)
				const range = resolveMeterRange(
					self,
					feedback.options.instanceTag,
					feedback.options.source,
					feedback.options.min,
					feedback.options.max,
				)
				const normalized = normalizedMeterValue(value, range.min, range.max)
				const imageSize = resolveImageSize(feedback.image)
				return {
					imageBuffer: buildMeterImage(
						imageSize.width,
						imageSize.height,
						normalized,
						'vertical-bottom-up',
						Number(feedback.options.padding ?? 2),
						[
							{ size: 72, color: combineRgb(0, 180, 70), background: combineRgb(0, 180, 70), backgroundOpacity: 48 },
							{ size: 20, color: combineRgb(255, 190, 0), background: combineRgb(255, 190, 0), backgroundOpacity: 48 },
							{ size: 8, color: combineRgb(220, 40, 20), background: combineRgb(220, 40, 20), backgroundOpacity: 48 },
						],
					),
				}
			},
		},
		vu_meter_left: {
			name: 'Meter - VU Meter - Left Of Button',
			type: 'advanced',
			description: 'Left-side bottom-to-top multi-colour VU meter for level variables.',
			options: [
				{
					id: 'source',
					type: 'textinput',
					label: 'Value or variable',
					default: '$(biamp-tesira:meter_ch1)',
					useVariables: true,
				},
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance ID for live range',
					default: '',
				},
				{
					id: 'min',
					type: 'number',
					label: 'Minimum dB',
					default: -90,
					min: -200,
					max: 100,
				},
				{
					id: 'max',
					type: 'number',
					label: 'Maximum dB',
					default: 20,
					min: -200,
					max: 100,
				},
				{
					id: 'padding',
					type: 'number',
					label: 'Padding',
					default: 2,
					min: 0,
					max: 20,
				},
			],
			callback: async (feedback, context) => {
				const value = await resolveNumber(context, feedback.options.source)
				const range = resolveMeterRange(
					self,
					feedback.options.instanceTag,
					feedback.options.source,
					feedback.options.min,
					feedback.options.max,
				)
				const normalized = normalizedMeterValue(value, range.min, range.max)
				const imageSize = resolveImageSize(feedback.image)
				return {
					imageBuffer: buildSideVuMeterImage(
						imageSize.width,
						imageSize.height,
						normalized,
						Number(feedback.options.padding ?? 2),
						'left',
					),
				}
			},
		},
		vu_meter_right: {
			name: 'Meter - VU Meter - Right Of Button',
			type: 'advanced',
			description: 'Right-side bottom-to-top multi-colour VU meter for level variables.',
			options: [
				{
					id: 'source',
					type: 'textinput',
					label: 'Value or variable',
					default: '$(biamp-tesira:meter_ch1)',
					useVariables: true,
				},
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance ID for live range',
					default: '',
				},
				{
					id: 'min',
					type: 'number',
					label: 'Minimum dB',
					default: -90,
					min: -200,
					max: 100,
				},
				{
					id: 'max',
					type: 'number',
					label: 'Maximum dB',
					default: 20,
					min: -200,
					max: 100,
				},
				{
					id: 'padding',
					type: 'number',
					label: 'Padding',
					default: 2,
					min: 0,
					max: 20,
				},
			],
			callback: async (feedback, context) => {
				const value = await resolveNumber(context, feedback.options.source)
				const range = resolveMeterRange(
					self,
					feedback.options.instanceTag,
					feedback.options.source,
					feedback.options.min,
					feedback.options.max,
				)
				const normalized = normalizedMeterValue(value, range.min, range.max)
				const imageSize = resolveImageSize(feedback.image)
				return {
					imageBuffer: buildSideVuMeterImage(
						imageSize.width,
						imageSize.height,
						normalized,
						Number(feedback.options.padding ?? 2),
						'right',
					),
				}
			},
		},
		vu_meter_left_with_inner_gr: {
			name: 'Meter - VU Meter - Left Of Button + Inner Gain Reduction',
			type: 'advanced',
			description: 'Left-side VU meter with an inner gain reduction strip.',
			options: [
				{
					id: 'sourceVu',
					type: 'textinput',
					label: 'VU value or variable',
					default: '$(biamp-tesira:meter_ch1)',
					useVariables: true,
				},
				{
					id: 'meterInstanceTag',
					type: 'textinput',
					label: 'VU Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceGainReduction',
					type: 'textinput',
					label: 'Gain reduction value or variable',
					default: '$(biamp-tesira:gain_reduction_1)',
					useVariables: true,
				},
				{
					id: 'gainReductionInstanceTag',
					type: 'textinput',
					label: 'Gain reduction Instance ID for live range',
					default: '',
				},
				{
					id: 'meterMin',
					type: 'number',
					label: 'VU minimum dB',
					default: -90,
					min: -200,
					max: 100,
				},
				{
					id: 'meterMax',
					type: 'number',
					label: 'VU maximum dB',
					default: 20,
					min: -200,
					max: 100,
				},
				{
					id: 'grMin',
					type: 'number',
					label: 'Gain reduction minimum',
					default: 0,
					min: 0,
					max: 60,
				},
				{
					id: 'grMax',
					type: 'number',
					label: 'Gain reduction maximum',
					default: 30,
					min: 0,
					max: 60,
				},
				{
					id: 'padding',
					type: 'number',
					label: 'Padding',
					default: 2,
					min: 0,
					max: 20,
				},
			],
			callback: async (feedback, context) => {
				const vuValue = await resolveNumber(context, feedback.options.sourceVu)
				const grValue = await resolveNumber(context, feedback.options.sourceGainReduction)
				const meterRange = resolveMeterRange(
					self,
					feedback.options.meterInstanceTag,
					feedback.options.sourceVu,
					feedback.options.meterMin,
					feedback.options.meterMax,
				)
				const vuNormalized = normalizedMeterValue(vuValue, meterRange.min, meterRange.max)
				const grRange = resolveGenericRange(
					self,
					feedback.options.gainReductionInstanceTag,
					feedback.options.sourceGainReduction,
					feedback.options.grMin,
					feedback.options.grMax,
				)
				const grNormalized = normalizedMeterValue(grValue, grRange.min, grRange.max)
				const imageSize = resolveImageSize(feedback.image)
				const padding = Number(feedback.options.padding ?? 2)
				return {
					imageBuffer: graphics.stackImage([
						buildSideVuMeterImage(imageSize.width, imageSize.height, vuNormalized, padding, 'left'),
						buildSideGainReductionMeterImage(imageSize.width, imageSize.height, grNormalized, padding, 'left'),
					]),
				}
			},
		},
		vu_meter_right_with_inner_gr: {
			name: 'Meter - VU Meter - Right Of Button + Inner Gain Reduction',
			type: 'advanced',
			description: 'Right-side VU meter with an inner gain reduction strip.',
			options: [
				{
					id: 'sourceVu',
					type: 'textinput',
					label: 'VU value or variable',
					default: '$(biamp-tesira:meter_ch1)',
					useVariables: true,
				},
				{
					id: 'meterInstanceTag',
					type: 'textinput',
					label: 'VU Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceGainReduction',
					type: 'textinput',
					label: 'Gain reduction value or variable',
					default: '$(biamp-tesira:gain_reduction_1)',
					useVariables: true,
				},
				{
					id: 'gainReductionInstanceTag',
					type: 'textinput',
					label: 'Gain reduction Instance ID for live range',
					default: '',
				},
				{
					id: 'meterMin',
					type: 'number',
					label: 'VU minimum dB',
					default: -90,
					min: -200,
					max: 100,
				},
				{
					id: 'meterMax',
					type: 'number',
					label: 'VU maximum dB',
					default: 20,
					min: -200,
					max: 100,
				},
				{
					id: 'grMin',
					type: 'number',
					label: 'Gain reduction minimum',
					default: 0,
					min: 0,
					max: 60,
				},
				{
					id: 'grMax',
					type: 'number',
					label: 'Gain reduction maximum',
					default: 30,
					min: 0,
					max: 60,
				},
				{
					id: 'padding',
					type: 'number',
					label: 'Padding',
					default: 2,
					min: 0,
					max: 20,
				},
			],
			callback: async (feedback, context) => {
				const vuValue = await resolveNumber(context, feedback.options.sourceVu)
				const grValue = await resolveNumber(context, feedback.options.sourceGainReduction)
				const meterRange = resolveMeterRange(
					self,
					feedback.options.meterInstanceTag,
					feedback.options.sourceVu,
					feedback.options.meterMin,
					feedback.options.meterMax,
				)
				const vuNormalized = normalizedMeterValue(vuValue, meterRange.min, meterRange.max)
				const grRange = resolveGenericRange(
					self,
					feedback.options.gainReductionInstanceTag,
					feedback.options.sourceGainReduction,
					feedback.options.grMin,
					feedback.options.grMax,
				)
				const grNormalized = normalizedMeterValue(grValue, grRange.min, grRange.max)
				const imageSize = resolveImageSize(feedback.image)
				const padding = Number(feedback.options.padding ?? 2)
				return {
					imageBuffer: graphics.stackImage([
						buildSideVuMeterImage(imageSize.width, imageSize.height, vuNormalized, padding, 'right'),
						buildSideGainReductionMeterImage(imageSize.width, imageSize.height, grNormalized, padding, 'right'),
					]),
				}
			},
		},
		gain_reduction_meter: {
			name: 'Meter - Gain Reduction',
			type: 'advanced',
			description: 'Top-to-bottom red meter for gain reduction variables.',
			options: [
				{
					id: 'source',
					type: 'textinput',
					label: 'Value or variable',
					default: '$(biamp-tesira:gain_reduction_1)',
					useVariables: true,
				},
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance ID for live range',
					default: '',
				},
				{
					id: 'min',
					type: 'number',
					label: 'Minimum reduction',
					default: 0,
					min: 0,
					max: 60,
				},
				{
					id: 'max',
					type: 'number',
					label: 'Maximum reduction',
					default: 30,
					min: 0,
					max: 60,
				},
				{
					id: 'padding',
					type: 'number',
					label: 'Padding',
					default: 2,
					min: 0,
					max: 20,
				},
			],
			callback: async (feedback, context) => {
				const value = await resolveNumber(context, feedback.options.source)
				const range = resolveGenericRange(
					self,
					feedback.options.instanceTag,
					feedback.options.source,
					feedback.options.min,
					feedback.options.max,
				)
				const normalized = normalizedMeterValue(value, range.min, range.max)
				const imageSize = resolveImageSize(feedback.image)
				return {
					imageBuffer: buildMeterImage(
						imageSize.width,
						imageSize.height,
						normalized,
						'vertical-top-down',
						Number(feedback.options.padding ?? 2),
						[{ size: 100, color: combineRgb(220, 30, 30), background: combineRgb(220, 30, 30), backgroundOpacity: 48 }],
					),
				}
			},
		},
		level_meter_horizontal: {
			name: 'Meter - Horizontal Level Meter',
			type: 'advanced',
			description: 'Left-to-right meter for level or control values.',
			options: [
				{
					id: 'source',
					type: 'textinput',
					label: 'Value or variable',
					default: '$(biamp-tesira:level_ch1)',
					useVariables: true,
				},
				{
					id: 'instanceTag',
					type: 'textinput',
					label: 'Instance ID for live range',
					default: '',
				},
				{
					id: 'min',
					type: 'number',
					label: 'Minimum',
					default: -100,
					min: -200,
					max: 200,
				},
				{
					id: 'max',
					type: 'number',
					label: 'Maximum',
					default: 12,
					min: -200,
					max: 200,
				},
				{
					id: 'padding',
					type: 'number',
					label: 'Padding',
					default: 2,
					min: 0,
					max: 20,
				},
			],
			callback: async (feedback, context) => {
				const value = await resolveNumber(context, feedback.options.source)
				const range = resolveLevelRange(
					self,
					feedback.options.instanceTag,
					feedback.options.source,
					feedback.options.min,
					feedback.options.max,
				)
				const normalized = normalizedMeterValue(value, range.min, range.max)
				const imageSize = resolveImageSize(feedback.image)
				const meterColor = resolveColorValue(feedback.options.color, combineRgb(40, 150, 255))
				return {
					imageBuffer: buildHorizontalLevelMeterImage(
						imageSize.width,
						imageSize.height,
						normalized,
						Number(feedback.options.padding ?? 2),
						meterColor,
					),
				}
			},
		},
		level_meter_with_right_vu: {
			name: 'Meter - Horizontal Level Meter - Right VU Meter',
			type: 'advanced',
			description: 'Horizontal set value meter with a paired right-side vertical meter.',
			options: [
				{
					id: 'sourceLevel',
					type: 'textinput',
					label: 'Level value or variable',
					default: '$(biamp-tesira:level_ch1)',
					useVariables: true,
				},
				{
					id: 'levelInstanceTag',
					type: 'textinput',
					label: 'Level Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceMeter',
					type: 'textinput',
					label: 'Paired meter value or variable',
					default: '$(biamp-tesira:meter_ch1)',
					useVariables: true,
				},
				{
					id: 'meterInstanceTag',
					type: 'textinput',
					label: 'VU Instance ID for live range',
					default: '',
				},
				{
					id: 'levelMin',
					type: 'number',
					label: 'Level minimum',
					default: -100,
					min: -200,
					max: 200,
				},
				{
					id: 'levelMax',
					type: 'number',
					label: 'Level maximum',
					default: 12,
					min: -200,
					max: 200,
				},
				{
					id: 'meterMin',
					type: 'number',
					label: 'Meter minimum',
					default: -90,
					min: -200,
					max: 100,
				},
				{
					id: 'meterMax',
					type: 'number',
					label: 'Meter maximum',
					default: 20,
					min: -200,
					max: 100,
				},
				{
					id: 'padding',
					type: 'number',
					label: 'Padding',
					default: 2,
					min: 0,
					max: 20,
				},
				{
					id: 'color',
					type: 'colorpicker',
					label: 'Horizontal meter color',
					default: combineRgb(40, 150, 255),
				},
			],
			callback: async (feedback, context) => {
				const levelValue = await resolveNumber(context, feedback.options.sourceLevel)
				const meterValue = await resolveNumber(context, feedback.options.sourceMeter)
				const levelRange = resolveLevelRange(
					self,
					feedback.options.levelInstanceTag,
					feedback.options.sourceLevel,
					feedback.options.levelMin,
					feedback.options.levelMax,
				)
				const meterRange = resolveMeterRange(
					self,
					feedback.options.meterInstanceTag,
					feedback.options.sourceMeter,
					feedback.options.meterMin,
					feedback.options.meterMax,
				)
				const levelNormalized = normalizedMeterValue(levelValue, levelRange.min, levelRange.max)
				const meterNormalized = normalizedMeterValue(meterValue, meterRange.min, meterRange.max)
				const imageSize = resolveImageSize(feedback.image)
				const padding = Number(feedback.options.padding ?? 2)
				const meterColor = resolveColorValue(feedback.options.color, combineRgb(40, 150, 255))
				const horizontal = buildHorizontalLevelMeterImage(
					imageSize.width,
					imageSize.height,
					levelNormalized,
					padding,
					meterColor,
				)
				const rightMeter = buildSideVuMeterImage(imageSize.width, imageSize.height, meterNormalized, padding, 'right')
				return {
					imageBuffer: graphics.stackImage([horizontal, rightMeter]),
				}
			},
		},
		level_meter_with_left_vu: {
			name: 'Meter - Horizontal Level Meter - Left VU Meter',
			type: 'advanced',
			description: 'Horizontal set value meter with a paired left-side vertical meter.',
			options: [
				{
					id: 'sourceLevel',
					type: 'textinput',
					label: 'Level value or variable',
					default: '$(biamp-tesira:level_ch1)',
					useVariables: true,
				},
				{
					id: 'levelInstanceTag',
					type: 'textinput',
					label: 'Level Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceMeter',
					type: 'textinput',
					label: 'Paired meter value or variable',
					default: '$(biamp-tesira:meter_ch1)',
					useVariables: true,
				},
				{
					id: 'meterInstanceTag',
					type: 'textinput',
					label: 'VU Instance ID for live range',
					default: '',
				},
				{
					id: 'levelMin',
					type: 'number',
					label: 'Level minimum',
					default: -100,
					min: -200,
					max: 200,
				},
				{
					id: 'levelMax',
					type: 'number',
					label: 'Level maximum',
					default: 12,
					min: -200,
					max: 200,
				},
				{
					id: 'meterMin',
					type: 'number',
					label: 'Meter minimum',
					default: -90,
					min: -200,
					max: 100,
				},
				{
					id: 'meterMax',
					type: 'number',
					label: 'Meter maximum',
					default: 20,
					min: -200,
					max: 100,
				},
				{
					id: 'padding',
					type: 'number',
					label: 'Padding',
					default: 2,
					min: 0,
					max: 20,
				},
				{
					id: 'color',
					type: 'colorpicker',
					label: 'Horizontal meter color',
					default: combineRgb(40, 150, 255),
				},
			],
			callback: async (feedback, context) => {
				const levelValue = await resolveNumber(context, feedback.options.sourceLevel)
				const meterValue = await resolveNumber(context, feedback.options.sourceMeter)
				const levelRange = resolveLevelRange(
					self,
					feedback.options.levelInstanceTag,
					feedback.options.sourceLevel,
					feedback.options.levelMin,
					feedback.options.levelMax,
				)
				const meterRange = resolveMeterRange(
					self,
					feedback.options.meterInstanceTag,
					feedback.options.sourceMeter,
					feedback.options.meterMin,
					feedback.options.meterMax,
				)
				const levelNormalized = normalizedMeterValue(levelValue, levelRange.min, levelRange.max)
				const meterNormalized = normalizedMeterValue(meterValue, meterRange.min, meterRange.max)
				const imageSize = resolveImageSize(feedback.image)
				const padding = Number(feedback.options.padding ?? 2)
				const meterColor = resolveColorValue(feedback.options.color, combineRgb(40, 150, 255))
				const horizontal = buildHorizontalLevelMeterImage(
					imageSize.width,
					imageSize.height,
					levelNormalized,
					padding,
					meterColor,
				)
				const leftMeter = buildSideVuMeterImage(imageSize.width, imageSize.height, meterNormalized, padding, 'left')
				return {
					imageBuffer: graphics.stackImage([horizontal, leftMeter]),
				}
			},
		},
		level_meter_with_left_vu_and_inner_gr: {
			name: 'Meter - Horizontal Level Meter - Left VU Meter + Inner Gain Reduction',
			type: 'advanced',
			description: 'Horizontal set value meter with a left-side VU meter and inner gain reduction strip.',
			options: [
				{
					id: 'sourceLevel',
					type: 'textinput',
					label: 'Level value or variable',
					default: '$(biamp-tesira:level_ch1)',
					useVariables: true,
				},
				{
					id: 'levelInstanceTag',
					type: 'textinput',
					label: 'Level Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceMeter',
					type: 'textinput',
					label: 'Paired meter value or variable',
					default: '$(biamp-tesira:meter_ch1)',
					useVariables: true,
				},
				{
					id: 'meterInstanceTag',
					type: 'textinput',
					label: 'VU Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceGainReduction',
					type: 'textinput',
					label: 'Gain reduction value or variable',
					default: '$(biamp-tesira:gain_reduction_1)',
					useVariables: true,
				},
				{
					id: 'gainReductionInstanceTag',
					type: 'textinput',
					label: 'Gain reduction Instance ID for live range',
					default: '',
				},
				{
					id: 'levelMin',
					type: 'number',
					label: 'Level minimum',
					default: -100,
					min: -200,
					max: 200,
				},
				{
					id: 'levelMax',
					type: 'number',
					label: 'Level maximum',
					default: 12,
					min: -200,
					max: 200,
				},
				{
					id: 'meterMin',
					type: 'number',
					label: 'VU minimum dB',
					default: -90,
					min: -200,
					max: 100,
				},
				{
					id: 'meterMax',
					type: 'number',
					label: 'VU maximum dB',
					default: 20,
					min: -200,
					max: 100,
				},
				{
					id: 'grMin',
					type: 'number',
					label: 'Gain reduction minimum',
					default: 0,
					min: 0,
					max: 60,
				},
				{
					id: 'grMax',
					type: 'number',
					label: 'Gain reduction maximum',
					default: 30,
					min: 0,
					max: 60,
				},
				{
					id: 'padding',
					type: 'number',
					label: 'Padding',
					default: 2,
					min: 0,
					max: 20,
				},
				{
					id: 'color',
					type: 'colorpicker',
					label: 'Horizontal meter color',
					default: combineRgb(40, 150, 255),
				},
			],
			callback: async (feedback, context) => {
				const levelValue = await resolveNumber(context, feedback.options.sourceLevel)
				const meterValue = await resolveNumber(context, feedback.options.sourceMeter)
				const grValue = await resolveNumber(context, feedback.options.sourceGainReduction)
				const levelRange = resolveLevelRange(
					self,
					feedback.options.levelInstanceTag,
					feedback.options.sourceLevel,
					feedback.options.levelMin,
					feedback.options.levelMax,
				)
				const meterRange = resolveMeterRange(
					self,
					feedback.options.meterInstanceTag,
					feedback.options.sourceMeter,
					feedback.options.meterMin,
					feedback.options.meterMax,
				)
				const levelNormalized = normalizedMeterValue(levelValue, levelRange.min, levelRange.max)
				const meterNormalized = normalizedMeterValue(meterValue, meterRange.min, meterRange.max)
				const grRange = resolveGenericRange(
					self,
					feedback.options.gainReductionInstanceTag,
					feedback.options.sourceGainReduction,
					feedback.options.grMin,
					feedback.options.grMax,
				)
				const grNormalized = normalizedMeterValue(grValue, grRange.min, grRange.max)
				const imageSize = resolveImageSize(feedback.image)
				const padding = Number(feedback.options.padding ?? 2)
				const meterColor = resolveColorValue(feedback.options.color, combineRgb(40, 150, 255))
				const horizontal = buildHorizontalLevelMeterImage(
					imageSize.width,
					imageSize.height,
					levelNormalized,
					padding,
					meterColor,
				)
				return {
					imageBuffer: graphics.stackImage([
						horizontal,
						buildSideVuMeterImage(imageSize.width, imageSize.height, meterNormalized, padding, 'left'),
						buildSideGainReductionMeterImage(imageSize.width, imageSize.height, grNormalized, padding, 'left'),
					]),
				}
			},
		},
		level_meter_with_right_vu_and_inner_gr: {
			name: 'Meter - Horizontal Level Meter - Right VU Meter + Inner Gain Reduction',
			type: 'advanced',
			description: 'Horizontal set value meter with a right-side VU meter and inner gain reduction strip.',
			options: [
				{
					id: 'sourceLevel',
					type: 'textinput',
					label: 'Level value or variable',
					default: '$(biamp-tesira:level_ch1)',
					useVariables: true,
				},
				{
					id: 'levelInstanceTag',
					type: 'textinput',
					label: 'Level Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceMeter',
					type: 'textinput',
					label: 'Paired meter value or variable',
					default: '$(biamp-tesira:meter_ch1)',
					useVariables: true,
				},
				{
					id: 'meterInstanceTag',
					type: 'textinput',
					label: 'VU Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceGainReduction',
					type: 'textinput',
					label: 'Gain reduction value or variable',
					default: '$(biamp-tesira:gain_reduction_1)',
					useVariables: true,
				},
				{
					id: 'gainReductionInstanceTag',
					type: 'textinput',
					label: 'Gain reduction Instance ID for live range',
					default: '',
				},
				{
					id: 'levelMin',
					type: 'number',
					label: 'Level minimum',
					default: -100,
					min: -200,
					max: 200,
				},
				{
					id: 'levelMax',
					type: 'number',
					label: 'Level maximum',
					default: 12,
					min: -200,
					max: 200,
				},
				{
					id: 'meterMin',
					type: 'number',
					label: 'VU minimum dB',
					default: -90,
					min: -200,
					max: 100,
				},
				{
					id: 'meterMax',
					type: 'number',
					label: 'VU maximum dB',
					default: 20,
					min: -200,
					max: 100,
				},
				{
					id: 'grMin',
					type: 'number',
					label: 'Gain reduction minimum',
					default: 0,
					min: 0,
					max: 60,
				},
				{
					id: 'grMax',
					type: 'number',
					label: 'Gain reduction maximum',
					default: 30,
					min: 0,
					max: 60,
				},
				{
					id: 'padding',
					type: 'number',
					label: 'Padding',
					default: 2,
					min: 0,
					max: 20,
				},
				{
					id: 'color',
					type: 'colorpicker',
					label: 'Horizontal meter color',
					default: combineRgb(40, 150, 255),
				},
			],
			callback: async (feedback, context) => {
				const levelValue = await resolveNumber(context, feedback.options.sourceLevel)
				const meterValue = await resolveNumber(context, feedback.options.sourceMeter)
				const grValue = await resolveNumber(context, feedback.options.sourceGainReduction)
				const levelRange = resolveLevelRange(
					self,
					feedback.options.levelInstanceTag,
					feedback.options.sourceLevel,
					feedback.options.levelMin,
					feedback.options.levelMax,
				)
				const meterRange = resolveMeterRange(
					self,
					feedback.options.meterInstanceTag,
					feedback.options.sourceMeter,
					feedback.options.meterMin,
					feedback.options.meterMax,
				)
				const levelNormalized = normalizedMeterValue(levelValue, levelRange.min, levelRange.max)
				const meterNormalized = normalizedMeterValue(meterValue, meterRange.min, meterRange.max)
				const grRange = resolveGenericRange(
					self,
					feedback.options.gainReductionInstanceTag,
					feedback.options.sourceGainReduction,
					feedback.options.grMin,
					feedback.options.grMax,
				)
				const grNormalized = normalizedMeterValue(grValue, grRange.min, grRange.max)
				const imageSize = resolveImageSize(feedback.image)
				const padding = Number(feedback.options.padding ?? 2)
				const meterColor = resolveColorValue(feedback.options.color, combineRgb(40, 150, 255))
				const horizontal = buildHorizontalLevelMeterImage(
					imageSize.width,
					imageSize.height,
					levelNormalized,
					padding,
					meterColor,
				)
				return {
					imageBuffer: graphics.stackImage([
						horizontal,
						buildSideVuMeterImage(imageSize.width, imageSize.height, meterNormalized, padding, 'right'),
						buildSideGainReductionMeterImage(imageSize.width, imageSize.height, grNormalized, padding, 'right'),
					]),
				}
			},
		},
		unified_meter: {
			name: 'Meter - Flexible Meter',
			type: 'advanced',
			description:
				'Configurable meter builder for horizontal level, single-side VU, stereo VU, and inner gain reduction layouts.',
			options: [
				{
					id: 'layout',
					type: 'dropdown',
					label: 'Layout',
					default: 'level_right_vu',
					choices: [
						{ id: 'vu_full', label: 'VU full button' },
						{ id: 'vu_left', label: 'VU left of button' },
						{ id: 'vu_right', label: 'VU right of button' },
						{ id: 'vu_left_gr', label: 'VU left + inner gain reduction' },
						{ id: 'vu_right_gr', label: 'VU right + inner gain reduction' },
						{ id: 'level_only', label: 'Horizontal level only' },
						{ id: 'level_left_vu', label: 'Horizontal level + left VU' },
						{ id: 'level_right_vu', label: 'Horizontal level + right VU' },
						{ id: 'level_left_vu_gr', label: 'Horizontal level + left VU + inner gain reduction' },
						{ id: 'level_right_vu_gr', label: 'Horizontal level + right VU + inner gain reduction' },
						{ id: 'stereo_vu', label: 'Stereo left and right VU' },
						{ id: 'stereo_vu_dual_gr', label: 'Stereo left and right VU + dual gain reduction' },
					],
				},
				{
					id: 'sourceLevel',
					type: 'textinput',
					label: 'Horizontal level source',
					default: '$(biamp-tesira:level_ch1)',
					useVariables: true,
				},
				{
					id: 'levelInstanceTag',
					type: 'textinput',
					label: 'Level Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceVu',
					type: 'textinput',
					label: 'Single VU source',
					default: '$(biamp-tesira:meter_ch1)',
					useVariables: true,
				},
				{
					id: 'vuInstanceTag',
					type: 'textinput',
					label: 'Single VU Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceLeftVu',
					type: 'textinput',
					label: 'Left VU source',
					default: '$(biamp-tesira:left_meter_ch1)',
					useVariables: true,
				},
				{
					id: 'leftVuInstanceTag',
					type: 'textinput',
					label: 'Left VU Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceRightVu',
					type: 'textinput',
					label: 'Right VU source',
					default: '$(biamp-tesira:right_meter_ch1)',
					useVariables: true,
				},
				{
					id: 'rightVuInstanceTag',
					type: 'textinput',
					label: 'Right VU Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceGainReduction',
					type: 'textinput',
					label: 'Single gain reduction source',
					default: '$(biamp-tesira:gain_reduction_1)',
					useVariables: true,
				},
				{
					id: 'gainReductionInstanceTag',
					type: 'textinput',
					label: 'Single gain reduction Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceLeftGainReduction',
					type: 'textinput',
					label: 'Left gain reduction source',
					default: '$(biamp-tesira:left_gain_reduction_1)',
					useVariables: true,
				},
				{
					id: 'leftGainReductionInstanceTag',
					type: 'textinput',
					label: 'Left gain reduction Instance ID for live range',
					default: '',
				},
				{
					id: 'sourceRightGainReduction',
					type: 'textinput',
					label: 'Right gain reduction source',
					default: '$(biamp-tesira:right_gain_reduction_1)',
					useVariables: true,
				},
				{
					id: 'rightGainReductionInstanceTag',
					type: 'textinput',
					label: 'Right gain reduction Instance ID for live range',
					default: '',
				},
				{
					id: 'levelMin',
					type: 'number',
					label: 'Level minimum',
					default: -100,
					min: -200,
					max: 200,
				},
				{
					id: 'levelMax',
					type: 'number',
					label: 'Level maximum',
					default: 12,
					min: -200,
					max: 200,
				},
				{
					id: 'meterMin',
					type: 'number',
					label: 'VU minimum dB',
					default: -90,
					min: -200,
					max: 100,
				},
				{
					id: 'meterMax',
					type: 'number',
					label: 'VU maximum dB',
					default: 20,
					min: -200,
					max: 100,
				},
				{
					id: 'grMin',
					type: 'number',
					label: 'Gain reduction minimum',
					default: 0,
					min: 0,
					max: 60,
				},
				{
					id: 'grMax',
					type: 'number',
					label: 'Gain reduction maximum',
					default: 30,
					min: 0,
					max: 60,
				},
				{
					id: 'padding',
					type: 'number',
					label: 'Padding',
					default: 2,
					min: 0,
					max: 20,
				},
				{
					id: 'color',
					type: 'colorpicker',
					label: 'Horizontal meter color',
					default: combineRgb(40, 150, 255),
				},
			],
			callback: async (feedback, context) => {
				const layout = String(feedback.options.layout ?? 'level_right_vu') as UnifiedMeterLayout
				const levelRange = resolveLevelRange(
					self,
					feedback.options.levelInstanceTag,
					feedback.options.sourceLevel,
					feedback.options.levelMin,
					feedback.options.levelMax,
				)
				const vuRange = resolveMeterRange(
					self,
					feedback.options.vuInstanceTag,
					feedback.options.sourceVu,
					feedback.options.meterMin,
					feedback.options.meterMax,
				)
				const leftVuRange = resolveMeterRange(
					self,
					feedback.options.leftVuInstanceTag,
					feedback.options.sourceLeftVu,
					feedback.options.meterMin,
					feedback.options.meterMax,
				)
				const rightVuRange = resolveMeterRange(
					self,
					feedback.options.rightVuInstanceTag,
					feedback.options.sourceRightVu,
					feedback.options.meterMin,
					feedback.options.meterMax,
				)
				const levelValue = normalizedMeterValue(
					await resolveNumber(context, feedback.options.sourceLevel),
					levelRange.min,
					levelRange.max,
				)
				const vuValue = normalizedMeterValue(
					await resolveNumber(context, feedback.options.sourceVu),
					vuRange.min,
					vuRange.max,
				)
				const leftVuValue = normalizedMeterValue(
					await resolveNumber(context, feedback.options.sourceLeftVu),
					leftVuRange.min,
					leftVuRange.max,
				)
				const rightVuValue = normalizedMeterValue(
					await resolveNumber(context, feedback.options.sourceRightVu),
					rightVuRange.min,
					rightVuRange.max,
				)
				const grRange = resolveGenericRange(
					self,
					feedback.options.gainReductionInstanceTag,
					feedback.options.sourceGainReduction,
					feedback.options.grMin,
					feedback.options.grMax,
				)
				const leftGrRange = resolveGenericRange(
					self,
					feedback.options.leftGainReductionInstanceTag,
					feedback.options.sourceLeftGainReduction,
					feedback.options.grMin,
					feedback.options.grMax,
				)
				const rightGrRange = resolveGenericRange(
					self,
					feedback.options.rightGainReductionInstanceTag,
					feedback.options.sourceRightGainReduction,
					feedback.options.grMin,
					feedback.options.grMax,
				)
				const grValue = normalizedMeterValue(
					await resolveNumber(context, feedback.options.sourceGainReduction),
					grRange.min,
					grRange.max,
				)
				const leftGrValue = normalizedMeterValue(
					await resolveNumber(context, feedback.options.sourceLeftGainReduction),
					leftGrRange.min,
					leftGrRange.max,
				)
				const rightGrValue = normalizedMeterValue(
					await resolveNumber(context, feedback.options.sourceRightGainReduction),
					rightGrRange.min,
					rightGrRange.max,
				)
				const imageSize = resolveImageSize(feedback.image)
				const padding = Number(feedback.options.padding ?? 2)
				const levelColor = resolveColorValue(feedback.options.color, combineRgb(40, 150, 255))
				const buffers = buildUnifiedMeterBuffers(
					layout,
					imageSize.width,
					imageSize.height,
					padding,
					levelValue,
					levelColor,
					vuValue,
					leftVuValue,
					rightVuValue,
					grValue,
					leftGrValue,
					rightGrValue,
				)
				return {
					imageBuffer: graphics.stackImage(buffers),
				}
			},
		},
	}

	self.setFeedbackDefinitions(feedbacks)
}
