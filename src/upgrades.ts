import type {
	CompanionMigrationAction,
	CompanionMigrationOptionValues,
	CompanionStaticUpgradeProps,
	CompanionStaticUpgradeResult,
	CompanionStaticUpgradeScript,
	CompanionUpgradeContext,
} from '@companion-module/base'
import type { ModuleConfig, ModuleSecrets } from './config.js'

const actionIdMap: Record<string, string> = {
	setFaderLevel: 'level_set',
	incFaderLevel: 'level_adjust',
	incFaderLevelTimer: 'level_hold_start',
	incFaderLevelStop: 'level_hold_stop',
	faderMute: 'mute_control',
	recallPreset: 'recall_preset',
	customCommand: 'raw_command',
	customPolling: 'poll_add',
	removeCustomPolling: 'poll_remove',
	pollOnce: 'poll_once',
	subscribeParameter: 'subscribe_helper',
	unsubscribeParameter: 'unsubscribe_helper',
}

type OptionValue = CompanionMigrationOptionValues[string]
type PlainValue = string | number | boolean | null | undefined

function asMutableOptions(action: CompanionMigrationAction): CompanionMigrationOptionValues {
	return action.options
}

/**
 * Companion 5 hands upgrade scripts every option as `{ isExpression, value }`.
 * Returns the plain value of a non-expression option, or `undefined` when the option is
 * missing or is an expression (which must be left alone).
 * Bare values (older data that was never wrapped) are tolerated as well.
 */
function readPlainValue(option: OptionValue | PlainValue): { value: unknown } | undefined {
	if (option === undefined || option === null) return undefined
	if (typeof option === 'object' && !Array.isArray(option) && 'isExpression' in option) {
		if (option.isExpression) return undefined
		return { value: option.value }
	}
	return { value: option }
}

function wrapValue<T extends string | number | boolean>(value: T): OptionValue {
	return { isExpression: false, value }
}

function renameOption(options: CompanionMigrationOptionValues, from: string, to: string): boolean {
	if (options[from] === undefined || options[to] !== undefined) return false
	options[to] = options[from]
	delete options[from]
	return true
}

function stringifyOption(options: CompanionMigrationOptionValues, key: string): boolean {
	const plain = readPlainValue(options[key])
	if (!plain) return false
	const value = plain.value
	if (typeof value !== 'number' && typeof value !== 'boolean') return false
	options[key] = wrapValue(String(value))
	return true
}

function remapCommonOptions(action: CompanionMigrationAction): boolean {
	const options = asMutableOptions(action)
	let changed = false

	changed = renameOption(options, 'instanceID', 'instanceTag') || changed
	changed = renameOption(options, 'presetID', 'presetId') || changed
	changed = renameOption(options, 'customvar', 'variableName') || changed
	changed = renameOption(options, 'index', 'index1') || changed
	changed = renameOption(options, 'muteStatus', 'state') || changed
	changed = renameOption(options, 'roundval', 'roundNumericValues') || changed

	for (const key of ['level', 'amount', 'channel', 'index1', 'index2', 'variableName', 'presetId', 'rate']) {
		changed = stringifyOption(options, key) || changed
	}

	return changed
}

function remapActionSpecificOptions(action: CompanionMigrationAction): boolean {
	const options = asMutableOptions(action)
	let changed = false

	switch (action.actionId) {
		case 'level_hold_start':
			changed = renameOption(options, 'rate', 'intervalMs') || changed
			{
				const plain = readPlainValue(options.intervalMs)
				if (plain) {
					const interval = Number(plain.value)
					options.intervalMs = wrapValue(plain.value !== '' && Number.isFinite(interval) ? interval : 500)
					changed = true
				}
			}
			break
		case 'raw_command':
			changed = renameOption(options, 'roundNumericValues', 'roundNumericSubscriptions') || changed
			break
		case 'poll_add':
		case 'poll_once':
		case 'poll_remove':
			if (options.variableName !== undefined) changed = stringifyOption(options, 'variableName') || changed
			break
		case 'subscribe_helper':
		case 'unsubscribe_helper':
			if (options.index1 !== undefined) changed = stringifyOption(options, 'index1') || changed
			if (options.variableName !== undefined) changed = stringifyOption(options, 'variableName') || changed
			break
	}

	return changed
}

function upgradeV2ActionIds(
	_context: CompanionUpgradeContext<ModuleConfig>,
	props: CompanionStaticUpgradeProps<ModuleConfig, ModuleSecrets | undefined>,
): CompanionStaticUpgradeResult<ModuleConfig, ModuleSecrets | undefined> {
	const updatedActions: CompanionMigrationAction[] = []

	for (const action of props.actions) {
		const nextActionId = actionIdMap[action.actionId]
		let changed = false

		if (nextActionId) {
			action.actionId = nextActionId
			changed = true
		}

		changed = remapCommonOptions(action) || changed
		changed = remapActionSpecificOptions(action) || changed

		if (changed) updatedActions.push(action)
	}

	return {
		updatedConfig: null,
		updatedSecrets: null,
		updatedActions,
		updatedFeedbacks: [],
	}
}

/** Template ids written by v3 presets/defaults that never matched a dropdown choice */
const legacyTemplateIdMap: Record<string, string> = {
	audio_meter_peak_rms__level: 'audio_meter_peak_rms___level',
	audio_meter_peak_rms__alllevels: 'audio_meter_peak_rms___alllevels',
}

/**
 * v4: move the legacy `attribute` option of Custom attribute subscription buttons into the
 * template/custom attribute fields, and correct template ids that never matched a choice.
 * This is a separate script so that connections which already ran the v3 script still get it.
 */
function upgradeV4SubscriptionTemplates(
	_context: CompanionUpgradeContext<ModuleConfig>,
	props: CompanionStaticUpgradeProps<ModuleConfig, ModuleSecrets | undefined>,
): CompanionStaticUpgradeResult<ModuleConfig, ModuleSecrets | undefined> {
	const updatedActions: CompanionMigrationAction[] = []

	for (const action of props.actions) {
		if (action.actionId !== 'subscribe_helper') continue
		const options = asMutableOptions(action)
		let changed = false

		if (options.attribute !== undefined) {
			if (options.customAttribute === undefined) {
				options.templateId = wrapValue('custom')
				options.customAttribute = options.attribute
			}
			delete options.attribute
			changed = true
		}

		const template = readPlainValue(options.templateId)
		if (template && typeof template.value === 'string' && legacyTemplateIdMap[template.value]) {
			options.templateId = wrapValue(legacyTemplateIdMap[template.value])
			changed = true
		}

		if (changed) updatedActions.push(action)
	}

	return {
		updatedConfig: null,
		updatedSecrets: null,
		updatedActions,
		updatedFeedbacks: [],
	}
}

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig, ModuleSecrets | undefined>[] = [
	upgradeV2ActionIds,
	upgradeV4SubscriptionTemplates,
]
