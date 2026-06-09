import type {
	CompanionMigrationAction,
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

function asMutableOptions(action: CompanionMigrationAction): Record<string, unknown> {
	return action.options as Record<string, unknown>
}

function renameOption(options: Record<string, unknown>, from: string, to: string): boolean {
	if (options[from] === undefined || options[to] !== undefined) return false
	options[to] = options[from]
	delete options[from]
	return true
}

function stringifyOption(options: Record<string, unknown>, key: string): boolean {
	if (options[key] === undefined || typeof options[key] === 'string') return false
	const value = options[key]
	if (typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'bigint') return false
	options[key] = String(value)
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
			if (options.intervalMs !== undefined) {
				const interval = Number(options.intervalMs)
				options.intervalMs = Number.isFinite(interval) ? interval : 500
				changed = true
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

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig, ModuleSecrets | undefined>[] = [
	upgradeV2ActionIds,
]
