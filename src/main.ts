import {
	InstanceBase,
	InstanceStatus,
	TelnetHelper,
	runEntrypoint,
	type CompanionVariableDefinition,
	type SomeCompanionConfigField,
} from '@companion-module/base'
import { GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'

interface TrackedSubscription {
	cmd: string
	unsubCmd: string
	roundNumericValues: boolean
}

interface PollCommand {
	command: string
	variableId: string
	roundNumericValues: boolean
	runOnce: boolean
	rangeProbe?: {
		instanceTag: string
		bound: 'min' | 'max'
		target: 'level' | 'meter' | 'generic'
	}
}

interface PendingPoll {
	command: string
	variableId: string
	roundNumericValues: boolean
	rangeProbe?: {
		instanceTag: string
		bound: 'min' | 'max'
		target: 'level' | 'meter' | 'generic'
	}
}

interface SubscribeRequest {
	instanceTag: string
	attribute: string
	index1?: string
	index2?: string
	variableName: string
	rate?: string
	roundNumericValues: boolean
	getInitial: boolean
}

interface UnsubscribeRequest {
	instanceTag: string
	attribute: string
	index1?: string
	index2?: string
	variableName: string
}

function isBlank(value: string | undefined): boolean {
	return !value || value.trim() === ''
}

function stripQuotes(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1).replace(/\\"/g, '"')
	}
	return value
}

function parseTesiraTokens(value: string): string[] {
	const trimmed = value.trim()
	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		const inner = trimmed.slice(1, -1)
		const matches = inner.match(/"([^"\\]|\\.)*"|[^\s]+/g) ?? []
		return matches.map((token) => stripQuotes(token))
	}
	return [stripQuotes(trimmed)]
}

function sanitizeVariableId(value: string): string {
	const sanitized = value
		.trim()
		.replace(/[^A-Za-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '')
	return sanitized || 'tesira_value'
}

function quoteToken(token: string): string {
	return `"${token.replace(/"/g, '\\"')}"`
}

function buildCommandParts(...parts: Array<string | undefined>): string {
	return parts
		.filter((part) => !isBlank(part))
		.join(' ')
		.trim()
}

function normalizeNumericText(value: string, roundNumericValues: boolean): string {
	const parsed = Number.parseFloat(value)
	if (!Number.isFinite(parsed)) return value
	return roundNumericValues ? String(Math.round(parsed)) : String(parsed)
}

function inferRangeProbeTarget(instanceTag: string, attribute: string): 'level' | 'meter' | 'generic' {
	const alias = instanceTag.toLowerCase()
	const attr = attribute.toLowerCase()

	if (/(meter|rms|peak|vu)/.test(alias)) return 'meter'
	if (attr === 'gainreduction') return 'generic'
	if (attr === 'level' || attr === 'mute' || attr === 'outputlevel' || attr === 'sourcelevel') return 'level'
	return 'generic'
}

function extractInstanceTagFromCommand(command: string): string | undefined {
	const trimmed = command.trim()
	if (!trimmed) return undefined
	const [instanceTag] = trimmed.split(/\s+/, 1)
	return instanceTag || undefined
}

export class ModuleInstance extends InstanceBase<ModuleConfig, ModuleSecrets> {
	config!: ModuleConfig
	secrets: ModuleSecrets = {}
	isReady = false
	lastError = 'Not connected'
	lastCommand = ''
	lastResponse = ''
	lastResponseNumeric = ''
	aliasList = ''
	aliases: string[] = []

	private socket: TelnetHelper | undefined
	private pollSocket: TelnetHelper | undefined
	private pollTimer: NodeJS.Timeout | undefined
	private levelHoldTimer: NodeJS.Timeout | undefined
	private pollQueue: PendingPoll[] = []
	private pollDrainResolver: (() => void) | undefined
	private pollingInProgress = false
	private pollingRerunRequested = false
	private readonly pollTimeoutMs = 5000

	private trackedSubscriptions = new Map<string, TrackedSubscription>()
	private trackedPolling = new Map<string, PollCommand>()
	private dynamicVariableDefinitions = new Map<string, CompanionVariableDefinition>()
	private dynamicVariableValues = new Map<string, string>()
	private startupSubscriptionIds = new Set<string>()
	private readonly startupControlSubscriptionRateMs = '250'
	private readonly startupMeterSubscriptionRateMs = '150'
	private liveAliasRanges = new Map<string, { min?: number; max?: number }>()
	private liveLevelRanges = new Map<string, { min?: number; max?: number }>()
	private liveMeterRanges = new Map<string, { min?: number; max?: number }>()

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets ?? {}
		this.syncStartupSubscriptions()
		this.refreshVariableDefinitions()
		this.updateVariables()
		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		await this.restartConnections()
	}

	async destroy(): Promise<void> {
		await this.closeConnections()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets ?? {}
		this.syncStartupSubscriptions()
		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.refreshVariableDefinitions()
		this.updateVariables()
		await this.restartConnections()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	getAliases(): string[] {
		return [...this.aliases]
	}

	getLiveLevelRange(instanceTag: string): { min: number; max: number } | undefined {
		const range = this.liveLevelRanges.get(instanceTag) ?? this.liveAliasRanges.get(instanceTag)
		if (range?.min === undefined || range?.max === undefined) return undefined
		return { min: range.min, max: range.max }
	}

	getLiveMeterRange(instanceTag: string): { min: number; max: number } | undefined {
		const range = this.liveMeterRanges.get(instanceTag) ?? this.liveAliasRanges.get(instanceTag)
		if (range?.min === undefined || range?.max === undefined) return undefined
		return { min: range.min, max: range.max }
	}

	getLiveAliasRange(instanceTag: string): { min: number; max: number } | undefined {
		const range =
			this.liveAliasRanges.get(instanceTag) ??
			this.liveLevelRanges.get(instanceTag) ??
			this.liveMeterRanges.get(instanceTag)
		if (range?.min === undefined || range?.max === undefined) return undefined
		return { min: range.min, max: range.max }
	}

	getDynamicVariableValue(variableId: string): string | undefined {
		return this.dynamicVariableValues.get(variableId)
	}

	private storeLearnedRange(
		instanceTag: string,
		min: number,
		max: number,
		target: 'level' | 'meter' | 'generic' = 'generic',
	): void {
		if (!instanceTag || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) return

		const store =
			target === 'meter' ? this.liveMeterRanges : target === 'level' ? this.liveLevelRanges : this.liveAliasRanges
		store.set(instanceTag, { min, max })

		const minName = `${instanceTag}_minLevel_1`
		const maxName = `${instanceTag}_maxLevel_1`
		this.ensureVariable(minName)
		this.ensureVariable(maxName)
		this.dynamicVariableValues.set(sanitizeVariableId(minName), String(min))
		this.dynamicVariableValues.set(sanitizeVariableId(maxName), String(max))

		this.updatePresets()
		this.updateVariables()
		this.checkFeedbacks(
			'vu_meter_vertical',
			'vu_meter_left',
			'vu_meter_right',
			'vu_meter_left_with_inner_gr',
			'vu_meter_right_with_inner_gr',
			'gain_reduction_meter',
			'level_meter_horizontal',
			'level_meter_with_left_vu',
			'level_meter_with_right_vu',
			'level_meter_with_left_vu_and_inner_gr',
			'level_meter_with_right_vu_and_inner_gr',
			'unified_meter',
		)
	}

	private learnRangeFromError(line: string): void {
		const match = line.match(/Value out of range: attr:([^\s]+)\s+min:([-+]?\d*\.?\d+)\s+max:([-+]?\d*\.?\d+)/i)
		if (!match) return

		const instanceTag = extractInstanceTagFromCommand(this.lastCommand)
		if (!instanceTag) return

		const attribute = (match[1] ?? '').toLowerCase()
		const min = Number.parseFloat(match[2] ?? '')
		const max = Number.parseFloat(match[3] ?? '')
		const target = inferRangeProbeTarget(instanceTag, attribute)
		this.storeLearnedRange(instanceTag, min, max, target)

		if (this.config.logResponses) {
			this.log('debug', `Tesira learned range from error for ${instanceTag}: min=${min} max=${max}`)
		}
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	refreshVariableDefinitions(): void {
		const baseDefinitions: CompanionVariableDefinition[] = [
			{ variableId: 'connected', name: 'Connected to Tesira' },
			{ variableId: 'connection_status', name: 'Connection status text' },
			{ variableId: 'last_error', name: 'Last error' },
			{ variableId: 'last_command', name: 'Last command sent' },
			{ variableId: 'last_response', name: 'Last response received' },
			{ variableId: 'last_response_numeric', name: 'Last numeric response value' },
			{ variableId: 'aliases', name: 'Latest instance tag list (aliases in Tesira TTP)' },
			{ variableId: 'alias_count', name: 'Instance tag count' },
		]

		this.setVariableDefinitions([...baseDefinitions, ...this.dynamicVariableDefinitions.values()])
	}

	updateVariables(): void {
		const values: Record<string, string> = {
			connected: this.isReady ? 'true' : 'false',
			connection_status: this.isReady ? 'Connected' : 'Disconnected',
			last_error: this.lastError,
			last_command: this.lastCommand,
			last_response: this.lastResponse,
			last_response_numeric: this.lastResponseNumeric,
			aliases: this.aliasList,
			alias_count: this.aliasList ? String(this.aliasList.split(',').filter(Boolean).length) : '0',
		}

		for (const [variableId, value] of this.dynamicVariableValues.entries()) {
			values[variableId] = value
		}

		this.setVariableValues(values)
	}

	async restartConnections(): Promise<void> {
		await this.closeConnections()

		if (!this.config.host?.trim()) {
			this.isReady = false
			this.lastError = 'Host is not configured'
			this.updateStatus(InstanceStatus.BadConfig, this.lastError)
			this.updateVariables()
			this.checkFeedbacks(
				'connected',
				'numeric_compare',
				'numeric_range',
				'text_match',
				'feature_state',
				'mute_state',
				'vu_meter_vertical',
				'vu_meter_left',
				'vu_meter_right',
				'vu_meter_left_with_inner_gr',
				'vu_meter_right_with_inner_gr',
				'gain_reduction_meter',
				'level_meter_horizontal',
				'level_meter_with_left_vu',
				'level_meter_with_right_vu',
				'level_meter_with_left_vu_and_inner_gr',
				'level_meter_with_right_vu_and_inner_gr',
				'unified_meter',
			)
			return
		}

		this.updateStatus(InstanceStatus.Connecting)
		this.initCommandSocket()
		this.initPollingSocket()
	}

	async closeConnections(): Promise<void> {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = undefined
		}
		if (this.levelHoldTimer) {
			clearInterval(this.levelHoldTimer)
			this.levelHoldTimer = undefined
		}

		if (this.socket) {
			for (const subscription of this.trackedSubscriptions.values()) {
				void this.socket.send(`${subscription.unsubCmd}\n`)
			}
			this.socket.destroy()
			this.socket = undefined
		}

		if (this.pollSocket) {
			this.pollSocket.destroy()
			this.pollSocket = undefined
		}

		this.pollQueue = []
		if (this.pollDrainResolver) {
			this.pollDrainResolver()
			this.pollDrainResolver = undefined
		}
	}

	sendCommand(command: string): void {
		if (!command) return

		this.lastCommand = command
		this.updateVariables()

		if (!this.socket?.isConnected) {
			this.lastError = 'Command socket is not connected'
			this.updateStatus(InstanceStatus.ConnectionFailure, this.lastError)
			this.updateVariables()
			return
		}

		void this.socket.send(`${command}\n`)
		this.log('debug', `Sent Tesira command: ${command}`)
	}

	addPollingCommand(
		command: string,
		variableName: string,
		roundNumericValues: boolean,
		runOnce: boolean,
		rangeProbe?: {
			instanceTag: string
			bound: 'min' | 'max'
			target: 'level' | 'meter' | 'generic'
		},
	): void {
		if (!command || !variableName) throw new Error('Polling command and variable name are required')
		const variableId = sanitizeVariableId(variableName)
		this.ensureVariable(variableName)
		this.trackedPolling.set(variableId, {
			command,
			variableId,
			roundNumericValues,
			runOnce,
			rangeProbe,
		})
	}

	removePollingCommand(variableName: string): void {
		if (!variableName) return
		this.trackedPolling.delete(sanitizeVariableId(variableName))
	}

	startLevelHold(
		instanceTag: string,
		channel: string,
		command: 'increment' | 'decrement',
		amount: string,
		intervalMs: number,
	): void {
		this.stopLevelHold()

		const sendAdjustment = (): void => {
			this.sendCommand(buildCommandParts(instanceTag, command, 'level', channel, amount))
		}

		sendAdjustment()
		this.levelHoldTimer = setInterval(sendAdjustment, Math.max(50, intervalMs))
	}

	stopLevelHold(): void {
		if (this.levelHoldTimer) {
			clearInterval(this.levelHoldTimer)
			this.levelHoldTimer = undefined
		}
	}

	subscribeToAttribute(request: SubscribeRequest): void {
		this.registerTrackedSubscription(request)
		this.sendCommand(
			buildCommandParts(
				request.instanceTag.trim(),
				'subscribe',
				request.attribute.trim(),
				request.index1?.trim(),
				request.index2?.trim(),
				quoteToken(request.variableName.trim()),
				isBlank(request.rate) ? String(this.config.defaultSubscriptionRate || 500) : request.rate?.trim(),
			),
		)

		this.queueRangeProbeForInstance(
			request.instanceTag.trim(),
			inferRangeProbeTarget(request.instanceTag, request.attribute),
		)

		if (request.getInitial) {
			const getCmd = buildCommandParts(
				request.instanceTag.trim(),
				'get',
				request.attribute.trim(),
				request.index1?.trim(),
				request.index2?.trim(),
			)
			this.addPollingCommand(getCmd, request.variableName, request.roundNumericValues, true)
			void this.doPolling()
		}
	}

	private queueRangeProbeForInstance(instanceTag: string, target: 'level' | 'meter' | 'generic' = 'generic'): void {
		if (!instanceTag) return
		if (this.getLiveAliasRange(instanceTag)) return

		this.addPollingCommand(`${instanceTag} get minLevel 1`, `${instanceTag}_minLevel_1`, false, true, {
			instanceTag,
			bound: 'min',
			target,
		})
		this.addPollingCommand(`${instanceTag} get maxLevel 1`, `${instanceTag}_maxLevel_1`, false, true, {
			instanceTag,
			bound: 'max',
			target,
		})

		void this.doPolling()
	}

	private registerTrackedSubscription(request: SubscribeRequest): void {
		const variableId = sanitizeVariableId(request.variableName)
		const rate = isBlank(request.rate) ? String(this.config.defaultSubscriptionRate || 500) : request.rate?.trim()
		const cmd = buildCommandParts(
			request.instanceTag.trim(),
			'subscribe',
			request.attribute.trim(),
			request.index1?.trim(),
			request.index2?.trim(),
			quoteToken(request.variableName.trim()),
			rate,
		)
		const unsubCmd = buildCommandParts(
			request.instanceTag.trim(),
			'unsubscribe',
			request.attribute.trim(),
			request.index1?.trim(),
			request.index2?.trim(),
			quoteToken(request.variableName.trim()),
		)

		this.ensureVariable(request.variableName)
		this.trackedSubscriptions.set(variableId, {
			cmd,
			unsubCmd,
			roundNumericValues: request.roundNumericValues,
		})
	}

	unsubscribeFromAttribute(request: UnsubscribeRequest): void {
		const variableId = sanitizeVariableId(request.variableName)
		const tracked = this.trackedSubscriptions.get(variableId)
		if (tracked) {
			this.sendCommand(tracked.unsubCmd)
			this.trackedSubscriptions.delete(variableId)
			return
		}

		const fallback = buildCommandParts(
			request.instanceTag.trim(),
			'unsubscribe',
			request.attribute.trim(),
			request.index1?.trim(),
			request.index2?.trim(),
			quoteToken(request.variableName.trim()),
		)
		this.sendCommand(fallback)
	}

	trackRawSubscriptionCommand(command: string, roundNumericValues: boolean): void {
		const tokens = command.match(/"([^"\\]|\\.)*"|[^\s]+/g) ?? []
		if (tokens.length < 4) return
		const verb = tokens[1]?.toLowerCase()
		if (verb === 'subscribe') {
			const maybeRate = tokens[tokens.length - 1]
			const labelToken = /^\d+$/.test(maybeRate) ? tokens[tokens.length - 2] : tokens[tokens.length - 1]
			if (!labelToken) return
			const variableName = stripQuotes(labelToken)
			const variableId = sanitizeVariableId(variableName)
			const unsubTokens = tokens.filter((_, index) => index !== tokens.length - 1 || !/^\d+$/.test(maybeRate))
			unsubTokens[1] = 'unsubscribe'
			this.ensureVariable(variableName)
			this.trackedSubscriptions.set(variableId, {
				cmd: command,
				unsubCmd: unsubTokens.join(' '),
				roundNumericValues,
			})
		} else if (verb === 'unsubscribe') {
			const labelToken = tokens[tokens.length - 1]
			if (!labelToken) return
			this.trackedSubscriptions.delete(sanitizeVariableId(stripQuotes(labelToken)))
		}
	}

	private initCommandSocket(): void {
		let receiveBuffer = ''

		this.socket = new TelnetHelper(this.config.host.trim(), this.config.port || 23)

		this.socket.on('status_change', (status: unknown, message: unknown) => {
			this.log('debug', `Tesira command socket: ${String(status)} ${String(message)}`)
		})

		this.socket.on('error', (error: Error) => {
			this.lastError = error.message
			this.isReady = false
			this.updateStatus(InstanceStatus.ConnectionFailure, error.message)
			this.updateVariables()
		})

		this.socket.on('data', (buffer: Buffer) => {
			receiveBuffer += buffer.toString('utf-8')
			receiveBuffer = this.respondToLoginPrompt(receiveBuffer, this.socket, 'command')
			const lines = receiveBuffer.split('\n')
			receiveBuffer = lines.pop() ?? ''
			for (const rawLine of lines) {
				const line = rawLine.replace(/\r$/, '')
				if (line) this.handleCommandLine(line)
			}
		})

		this.socket.on('iac', (type: string, info: number) => {
			if (type === 'DO') void this.socket?.send(Buffer.from([255, 252, info]))
			if (type === 'WILL') void this.socket?.send(Buffer.from([255, 254, info]))
		})
	}

	private initPollingSocket(): void {
		let receiveBuffer = ''

		this.pollSocket = new TelnetHelper(this.config.host.trim(), this.config.port || 23)

		this.pollSocket.on('status_change', (status: unknown, message: unknown) => {
			this.log('debug', `Tesira polling socket: ${String(status)} ${String(message)}`)
		})

		this.pollSocket.on('error', (error: Error) => {
			this.lastError = error.message
			this.log('warn', `Tesira polling socket error: ${error.message}`)
			this.updateStatus(InstanceStatus.ConnectionFailure, `Polling socket: ${error.message}`)
			this.updateVariables()
		})

		this.pollSocket.on('connect', () => {
			if (this.pollTimer) clearInterval(this.pollTimer)
			this.pollTimer = setInterval(() => void this.doPolling(), Math.max(250, this.config.pollingInterval || 1000))
			void this.doPolling()
		})

		this.pollSocket.on('data', (buffer: Buffer) => {
			receiveBuffer += buffer.toString('utf-8')
			receiveBuffer = this.respondToLoginPrompt(receiveBuffer, this.pollSocket, 'polling')
			const lines = receiveBuffer.split('\n')
			receiveBuffer = lines.pop() ?? ''
			for (const rawLine of lines) {
				const line = rawLine.replace(/\r$/, '')
				if (line) this.handlePollingLine(line)
			}
		})

		this.pollSocket.on('iac', (type: string, info: number) => {
			if (type === 'DO') void this.pollSocket?.send(Buffer.from([255, 252, info]))
			if (type === 'WILL') void this.pollSocket?.send(Buffer.from([255, 254, info]))
		})
	}

	private respondToLoginPrompt(buffer: string, socket: TelnetHelper | undefined, socketName: string): string {
		const prompt = buffer.replace(/\r\0/g, '\n').replace(/\r/g, '\n').split('\n').pop()?.trim().toLowerCase()

		if (!prompt || !socket?.isConnected) return buffer

		if (/^(login|username|user name|user):\s*$/.test(prompt)) {
			const username = this.config.loginUsername?.trim() || 'default'
			this.lastCommand = 'login username'
			this.log('debug', `Sent Tesira ${socketName} socket login username`)
			void socket.send(`${username}\n`)
			this.updateVariables()
			return ''
		}

		if (/^password:\s*$/.test(prompt)) {
			const password = this.secrets.loginPassword ?? 'default'
			this.lastCommand = 'login password'
			this.log('debug', `Sent Tesira ${socketName} socket login password`)
			void socket.send(`${password}\n`)
			this.updateVariables()
			return ''
		}

		return buffer
	}

	private handleCommandLine(line: string): void {
		this.lastResponse = line
		if (this.config.logResponses) this.log('debug', `Tesira response: ${line}`)

		if (line.includes('Welcome to the Tesira Text Protocol Server')) {
			this.isReady = true
			this.lastError = ''
			this.updateStatus(InstanceStatus.Ok)
			if (this.config.autoFetchAliases) this.sendCommand('SESSION get aliases')
			for (const subscription of this.trackedSubscriptions.values()) {
				this.sendCommand(subscription.cmd)
			}
			this.queueStartupInitialPolling()
		}

		if (line.startsWith('-ERR')) {
			this.lastError = line
			this.learnRangeFromError(line)
		}

		this.parseSubscriptionResponse(line)
		this.parseAliasList(line)
		this.parseOkValue(line, undefined)
		this.updateVariables()
		this.checkFeedbacks(
			'connected',
			'numeric_compare',
			'numeric_range',
			'text_match',
			'feature_state',
			'mute_state',
			'vu_meter_vertical',
			'vu_meter_left',
			'vu_meter_right',
			'vu_meter_left_with_inner_gr',
			'vu_meter_right_with_inner_gr',
			'gain_reduction_meter',
			'level_meter_horizontal',
			'level_meter_with_left_vu',
			'level_meter_with_right_vu',
			'level_meter_with_left_vu_and_inner_gr',
			'level_meter_with_right_vu_and_inner_gr',
			'unified_meter',
		)
	}

	private handlePollingLine(line: string): void {
		if (this.config.logResponses) this.log('debug', `Tesira poll response: ${line}`)
		if (line.includes('Welcome to the Tesira Text Protocol Server')) return

		if (this.pollQueue.length === 0) return

		if (line.startsWith('-ERR')) {
			const pending = this.pollQueue.shift()
			this.lastError = pending ? `${pending.variableId}: ${line}` : line
			if (this.config.logResponses && pending) {
				this.log('debug', `Tesira poll error for ${pending.command}: ${line}`)
			}
			if (this.pollQueue.length === 0 && this.pollDrainResolver) this.pollDrainResolver()
			this.updateVariables()
			return
		}

		const pending = this.pollQueue.shift()
		if (!pending) return
		this.parseOkValue(line, pending)

		if (this.pollQueue.length === 0 && this.pollDrainResolver) this.pollDrainResolver()
	}

	private parseSubscriptionResponse(line: string): void {
		const match = line.match(/^!\s+"publishToken":"([^"]+)"\s+"value":(.+?)(?:\s+\+OK)?$/)
		if (!match) return

		const publishToken = match[1]
		const valueTokens = parseTesiraTokens(match[2])
		const tracked = this.trackedSubscriptions.get(sanitizeVariableId(publishToken))
		this.storeValueTokens(publishToken, valueTokens, tracked?.roundNumericValues ?? false)
	}

	private parseAliasList(line: string): void {
		const match = line.match(/^\+OK\s+"list":\[(.*)\]$/)
		if (!match) return

		const aliases = parseTesiraTokens(`[${match[1]}]`)
		this.aliases = aliases
		this.aliasList = aliases.join(', ')
		this.liveAliasRanges.clear()
		this.liveLevelRanges.clear()
		this.liveMeterRanges.clear()
		this.ensureVariable('aliases_list')
		this.dynamicVariableValues.set('aliases_list', this.aliasList)
		this.updatePresets()
		this.queueDiscoveredRangePolling()
	}

	private parseOkValue(line: string, pending: PendingPoll | undefined): void {
		const match = line.match(/^\+OK\s+"(?:value|list)":(.*)$/)
		if (!match) return
		const tokens = parseTesiraTokens(match[1])
		const roundNumericValues = pending?.roundNumericValues ?? false

		if (tokens.length > 0) {
			const firstNumeric = Number.parseFloat(tokens[0])
			this.lastResponseNumeric = Number.isFinite(firstNumeric)
				? normalizeNumericText(tokens[0], roundNumericValues)
				: this.lastResponseNumeric
		}

		if (pending) {
			if (pending.rangeProbe && tokens.length > 0) {
				if (this.config.logResponses) {
					this.log(
						'debug',
						`Tesira range probe ${pending.rangeProbe.instanceTag} ${pending.rangeProbe.bound} from ${pending.command}: ${tokens.join(', ')}`,
					)
				}
				const parsed = Number.parseFloat(tokens[0])
				if (Number.isFinite(parsed)) {
					const store =
						pending.rangeProbe.target === 'meter'
							? this.liveMeterRanges
							: pending.rangeProbe.target === 'level'
								? this.liveLevelRanges
								: this.liveAliasRanges
					const existing = store.get(pending.rangeProbe.instanceTag) ?? {}
					if (pending.rangeProbe.bound === 'min') existing.min = parsed
					else existing.max = parsed
					store.set(pending.rangeProbe.instanceTag, existing)
					this.updatePresets()
					this.checkFeedbacks(
						'vu_meter_vertical',
						'vu_meter_left',
						'vu_meter_right',
						'vu_meter_left_with_inner_gr',
						'vu_meter_right_with_inner_gr',
						'level_meter_horizontal',
						'level_meter_with_left_vu',
						'level_meter_with_right_vu',
						'level_meter_with_left_vu_and_inner_gr',
						'level_meter_with_right_vu_and_inner_gr',
						'unified_meter',
					)
				}
			}
			this.storeValueTokens(pending.variableId, tokens, roundNumericValues, true)
		}
	}

	private storeValueTokens(
		variableName: string,
		tokens: string[],
		roundNumericValues: boolean,
		alreadySanitized = false,
	): void {
		const variableId = alreadySanitized ? variableName : sanitizeVariableId(variableName)
		const sourceName = alreadySanitized ? variableName : variableName.trim()
		this.ensureVariable(sourceName)

		if (tokens.length === 1) {
			const normalized = normalizeNumericText(tokens[0], roundNumericValues)
			this.dynamicVariableValues.set(variableId, normalized)
			this.lastResponseNumeric = Number.isFinite(Number.parseFloat(tokens[0])) ? normalized : this.lastResponseNumeric
		} else {
			const normalizedTokens = tokens.map((token) => normalizeNumericText(token, roundNumericValues))
			this.dynamicVariableValues.set(variableId, normalizedTokens.join(', '))
			normalizedTokens.forEach((token, index) => {
				const indexedName = `${sourceName}_${index + 1}`
				const indexedId = sanitizeVariableId(indexedName)
				this.ensureVariable(indexedName)
				this.dynamicVariableValues.set(indexedId, token)
			})
			const firstNumeric = Number.parseFloat(normalizedTokens[0])
			if (Number.isFinite(firstNumeric)) this.lastResponseNumeric = normalizedTokens[0]
		}

		this.updateVariables()
	}

	private ensureVariable(variableName: string): void {
		const variableId = sanitizeVariableId(variableName)
		if (this.dynamicVariableDefinitions.has(variableId)) return
		this.dynamicVariableDefinitions.set(variableId, {
			variableId,
			name: variableName.trim(),
		})
		this.refreshVariableDefinitions()
	}

	private syncStartupSubscriptions(): void {
		for (const variableId of this.startupSubscriptionIds) {
			this.trackedSubscriptions.delete(variableId)
		}
		this.startupSubscriptionIds.clear()

		const tags = (this.config.startupControlSubscriptions ?? '')
			.split(',')
			.map((tag) => tag.trim())
			.filter(Boolean)

		for (const tag of tags) {
			const levelVariable = `${tag}_level_1`
			const muteVariable = `${tag}_mute_1`

			this.registerTrackedSubscription({
				instanceTag: tag,
				attribute: 'level',
				index1: '1',
				index2: '',
				variableName: levelVariable,
				rate: this.startupControlSubscriptionRateMs,
				roundNumericValues: false,
				getInitial: false,
			})
			this.startupSubscriptionIds.add(sanitizeVariableId(levelVariable))

			this.registerTrackedSubscription({
				instanceTag: tag,
				attribute: 'mute',
				index1: '1',
				index2: '',
				variableName: muteVariable,
				rate: this.startupControlSubscriptionRateMs,
				roundNumericValues: false,
				getInitial: false,
			})
			this.startupSubscriptionIds.add(sanitizeVariableId(muteVariable))
		}

		const meterTags = (this.config.startupMeterSubscriptions ?? '')
			.split(',')
			.map((tag) => tag.trim())
			.filter(Boolean)

		for (const tag of meterTags) {
			const meterVariable = `${tag}_meter_1`

			this.registerTrackedSubscription({
				instanceTag: tag,
				attribute: 'level',
				index1: '1',
				index2: '',
				variableName: meterVariable,
				rate: this.startupMeterSubscriptionRateMs,
				roundNumericValues: false,
				getInitial: false,
			})
			this.startupSubscriptionIds.add(sanitizeVariableId(meterVariable))
		}
	}

	private queueStartupInitialPolling(): void {
		const tags = (this.config.startupControlSubscriptions ?? '')
			.split(',')
			.map((tag) => tag.trim())
			.filter(Boolean)

		for (const tag of tags) {
			this.addPollingCommand(`${tag} get level 1`, `${tag}_level_1`, false, true)
			this.addPollingCommand(`${tag} get mute 1`, `${tag}_mute_1`, false, true)
		}

		const meterTags = (this.config.startupMeterSubscriptions ?? '')
			.split(',')
			.map((tag) => tag.trim())
			.filter(Boolean)

		for (const tag of meterTags) {
			this.addPollingCommand(`${tag} get level 1`, `${tag}_meter_1`, false, true)
		}

		if (tags.length > 0 || meterTags.length > 0) void this.doPolling()
	}

	private queueDiscoveredRangePolling(): void {
		for (const alias of this.aliases) {
			this.addPollingCommand(`${alias} get minLevel 1`, `${alias}_minLevel_1`, false, true, {
				instanceTag: alias,
				bound: 'min',
				target: 'generic',
			})
			this.addPollingCommand(`${alias} get maxLevel 1`, `${alias}_maxLevel_1`, false, true, {
				instanceTag: alias,
				bound: 'max',
				target: 'generic',
			})
		}

		if (this.aliases.length > 0) void this.doPolling()
	}

	private async doPolling(): Promise<void> {
		if (this.pollingInProgress) {
			this.pollingRerunRequested = true
			return
		}
		if (!this.pollSocket?.isConnected) return
		if (this.trackedPolling.size === 0) return

		this.pollingInProgress = true
		const sentRunOnceIds = new Set<string>()
		try {
			for (const [variableId, pollCommand] of Array.from(this.trackedPolling.entries())) {
				this.pollQueue.push({
					command: pollCommand.command,
					variableId,
					roundNumericValues: pollCommand.roundNumericValues,
					rangeProbe: pollCommand.rangeProbe,
				})
				if (pollCommand.runOnce) sentRunOnceIds.add(variableId)
				void this.pollSocket.send(`${pollCommand.command}\n`)
			}

			let timeoutHandle: NodeJS.Timeout | undefined
			await Promise.race([
				new Promise<void>((resolve) => {
					this.pollDrainResolver = resolve
				}),
				new Promise<void>((resolve) => {
					timeoutHandle = setTimeout(resolve, this.pollTimeoutMs)
				}),
			])
			if (timeoutHandle) clearTimeout(timeoutHandle)
			this.pollDrainResolver = undefined
			this.pollQueue = []

			for (const variableId of sentRunOnceIds) {
				const pollCommand = this.trackedPolling.get(variableId)
				if (pollCommand?.runOnce) this.trackedPolling.delete(variableId)
			}
		} finally {
			this.pollingInProgress = false
			if (this.pollingRerunRequested) {
				this.pollingRerunRequested = false
				void this.doPolling()
			}
		}
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
