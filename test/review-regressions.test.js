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
