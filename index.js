const { InstanceBase, Regex, TelnetHelper, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')

class TesiraInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.config = config
		this.TIMER_FADER = null
		this.TIMER_POLLING = null
		this.customVarNames = []
		this.customVars = []
		this.pollingCmds = []
		this.pollVar = undefined
		this.subscribeVars = []

		this.log('debug', 'Init')

		this.updateStatus(InstanceStatus.Connecting)

		this.initPresets()
		this.initTCP()
		this.initPollingTCP()

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
	}

	// When module gets deleted
	async destroy() {
		if (this.socket !== undefined) {
			this.socket.destroy()
		}

		//destroy timers
		if (this.TIMER_FADER !== null) {
			clearInterval(this.TIMER_FADER)
			this.TIMER_FADER = null
		}

		if (this.TIMER_POLLING !== null) {
			clearInterval(this.TIMER_POLLING)
			this.TIMER_POLLING = null
		}

		this.log('debug', 'Destroy')
	}

	async configUpdated(config) {
		this.config = config

		if (this.TIMER_POLLING !== null) {
			clearInterval(this.TIMER_POLLING)
			this.TIMER_POLLING = null
		}

		this.TIMER_POLLING = setInterval(this.doPolling.bind(this), this.config.pollinginterval)
	}

	initTCP() {
		const maxBufferLength = 2048
		let receivebuffer = []

		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.config.host) {
			this.log('debug', 'Connection to ' + this.config.host + ' port 23')
			this.socket = new TelnetHelper(this.config.host, 23)

			this.socket.on('status_change', (status, message) => {
				this.log('debug', status + ' -- ' + message)
			})

			this.socket.on('error', (err) => {
				this.log('error', 'Network error: ' + err.message)
			})

			this.socket.on('connect', () => {
				this.log('debug', 'Socket Connected')
			})

			this.socket.on('data', (buffer) => {
				const line = buffer.toString('utf-8')

				this.log('debug', 'Data: ' + line)

				// Match part of the response from unit when a connection is made.
				if (line.match(/Welcome to the Tesira Text Protocol Server/)) {
					this.updateStatus(InstanceStatus.Ok)
				}

				//capture subscription responses into custom variables (example:! "publishToken":"MyLevelCustomLabel" "value":-100.0000)
				//regEx to capture label and value:  /! \"publishToken\":\"(\w*)\" \"value\":(.*)/gm
				const matchTokens = line.matchAll(/! \"publishToken\":\"(\w*)\" \"value\":(.*)/g)
				for (const token of matchTokens) {
					//remove all the useless trailing zeros from number values
					var varName = token[1]
					var value = token[2]

					var tmpVar = {}
					//handle the possiblity of an array return value
					//Append "_" + index to the variable name for each element
					var tokenValueMatches = value.match(/\[(.*?)\]/)
					if (tokenValueMatches != null) {
						//Split the string into an array by space delimiter, ignore spaces within quotes
						const regex = /"[^"\\]*(?:\\.[^"\\]*)*"|[^\s"']+/g
						const result = tokenValueMatches[1].match(regex)
						for (var resultToken in result) {
							//Remove quotes and replace escaped quotes
							var tokenValue = result[resultToken].replace(/(?<!\\)"/g, '').replace(/\\"/g, '"')

							//Add custom variable if needed
							var tmpVarName = varName + '_' + (parseInt(resultToken) + 1)
							if (!(tmpVarName in this.customVarNames)) {
								this.customVarNames[tmpVarName] = ''
								this.customVars.push({ name: tmpVarName, variableId: tmpVarName })
								this.setVariableDefinitions(this.customVars)
							}

							//Check if this is a value that should be rounded to whole number
							let varIdx = this.subscribeVars.findIndex((obj) => obj.name === varName)
							if (varIdx > -1 && this.subscribeVars[varIdx].roundVal && !isNaN(tokenValue)) {
								const numberValue = parseFloat(tokenValue)
								tokenValue = Math.round(numberValue).toString()
							}

							//Remove trailing zeroes
							tokenValue = tokenValue.replace(/(\.\d*?[1-9])0+|\.0*$/, '$1')
							tmpVar[tmpVarName] = tokenValue
							this.log('debug', 'Variable set - ' + tmpVarName + ' = ' + tokenValue)
						}
					} else {
						//Not an array, process single return value
						//Remove quotes and replace escaped quotes
						value = value.replace(/(?<!\\)"/g, '').replace(/\\"/g, '"')

						//Add custom variable if needed
						if (!(varName in this.customVarNames)) {
							this.customVarNames[varName] = ''
							this.customVars.push({ name: varName, variableId: varName })
							this.setVariableDefinitions(this.customVars)
						}

						//Check if this is a value that should be rounded to whole number
						let varIdx = this.subscribeVars.findIndex((obj) => obj.name === varName)
						if (varIdx > -1 && this.subscribeVars[varIdx].roundVal && !isNaN(value)) {
							const numberValue = parseFloat(value)
							value = Math.round(numberValue).toString()
						}

						//Remove trailing zeroes
						value = value.replace(/(\.\d*?[1-9])0+|\.0*$/, '$1')
						tmpVar[varName] = value
						this.log('debug', 'Variable set - ' + varName + ' = ' + value)
					}

					this.setVariableValues(tmpVar)
				}
			})

			this.socket.on('iac', (type, info) => {
				this.log('debug', 'Telnet- IAC')
				// tell remote we WONT do anything we're asked to DO
				if (type == 'DO') {
					this.socket.send(Buffer.from([255, 252, info]))
				}

				// tell the remote DONT do whatever they WILL offer
				if (type == 'WILL') {
					this.socket.send(Buffer.from([255, 254, info]))
				}
			})
		} else {
			this.log('info', 'Please specify host in config.')
		}
	}

	//Create a separate connection to manage the timed polling queries so the received data doesn't overlap with the subscription updates
	initPollingTCP() {
		const maxBufferLength = 2048
		let receivebuffer = []

		if (this.poll_socket !== undefined) {
			this.poll_socket.destroy()
			delete this.poll_socket
		}

		if (this.config.host) {
			this.log('debug', 'Polling connection to ' + this.config.host + ' port 23')
			this.poll_socket = new TelnetHelper(this.config.host, 23)

			this.poll_socket.on('status_change', (status, message) => {
				this.log('debug', status + ' -- ' + message)
			})

			this.poll_socket.on('error', (err) => {
				this.log('error', 'Network error: ' + err.message)
			})

			this.poll_socket.on('connect', () => {
				this.log('debug', 'Polling socket connected')

				if (this.TIMER_POLLING !== null) {
					clearInterval(this.TIMER_POLLING)
					this.TIMER_POLLING = null
				}

				this.TIMER_POLLING = setInterval(this.doPolling.bind(this), this.config.pollinginterval)
			})

			this.poll_socket.on('data', (buffer) => {
				const line = buffer.toString('utf-8')

				this.log('debug', 'Polling data: ' + line)

				//capture subscription responses into custom variables (example:! "publishToken":"MyLevelCustomLabel" "value":-100.0000)
				//regEx to capture label and value:  /! \"publishToken\":\"(\w*)\" \"value\":(.*)/gm
				if (this.pollVar !== undefined && this.pollVar.name != '' && line.match(/\+OK (\"value\"|\"list\"):.*/)) {
					var tokens = line.match(/\+OK (?:\"value\"|\"list\"):(.*)/)

					var value = tokens[1]
					var tmpVar = {}

					//handle the possiblity of an array return value
					//Append "_" + index to the variable name for each element
					var tokenValueMatches = value.match(/\[(.*?)\]/)
					if (tokenValueMatches != null) {
						//Split the string into an array by space delimiter, ignore spaces within quotes
						const regex = /"[^"\\]*(?:\\.[^"\\]*)*"|[^\s"']+/g
						const result = tokenValueMatches[1].match(regex)
						for (var token in result) {
							//Remove quotes and replace escaped quotes
							var tokenValue = result[token].replace(/(?<!\\)"/g, '').replace(/\\"/g, '"')

							//Add custom variable if needed
							var tmpVarName = this.pollVar.name + '_' + (parseInt(token) + 1)
							if (!(tmpVarName in this.customVarNames)) {
								this.customVarNames[tmpVarName] = ''
								this.customVars.push({ name: tmpVarName, variableId: tmpVarName })
								this.setVariableDefinitions(this.customVars)
							}

							//Check if this is a value that should be rounded to whole number
							if (this.pollVar.roundVal && !isNaN(tokenValue)) {
								const numberValue = parseFloat(tokenValue)
								tokenValue = Math.round(numberValue).toString()
							}

							//Remove trailing zeroes
							tokenValue = tokenValue.replace(/(\.\d*?[1-9])0+|\.0*$/, '$1')
							tmpVar[tmpVarName] = tokenValue
							this.log('debug', 'Variable set - ' + tmpVarName + ' = ' + tokenValue)
						}
					} else {
						//Remove quotes and replace escaped quotes
						value = value.replace(/(?<!\\)"/g, '').replace(/\\"/g, '"')

						//Add custom variable if needed
						if (!(this.pollVar.name in this.customVarNames)) {
							this.customVarNames[this.pollVar.name] = ''
							this.customVars.push({ name: this.pollVar.name, variableId: this.pollVar.name })
							this.setVariableDefinitions(this.customVars)
						}

						//Check if this is a value that should be rounded to whole number
						if (this.pollVar.roundVal && !isNaN(value)) {
							const numberValue = parseFloat(tokenValue)
							value = Math.round(numberValue).toString()
						}

						//Remove trailing zeroes
						value = value.replace(/(\.\d*?[1-9])0+|\.0*$/, '$1')
						tmpVar[this.pollVar.name] = value
						this.log('debug', 'Variable set - ' + this.pollVar.name + ' = ' + value)
					}

					this.setVariableValues(tmpVar)
					this.pollVar.name = ''
					this.pollVar.resolver()
				}
			})

			this.poll_socket.on('iac', (type, info) => {
				this.log('debug', 'Telnet- IAC')
				// tell remote we WONT do anything we're asked to DO
				if (type == 'DO') {
					this.poll_socket.send(Buffer.from([255, 252, info]))
				}

				// tell the remote DONT do whatever they WILL offer
				if (type == 'WILL') {
					this.poll_socket.send(Buffer.from([255, 254, info]))
				}
			})
		} else {
			this.log('info', 'Please specify host in config.')
		}
	}

	async doPolling() {
		for (let i = 0; i < this.pollingCmds.length; i++) {
			let pollCmd = this.pollingCmds[i]
			this.pollVar = { name: pollCmd.varName, roundVal: pollCmd.roundVal, resolver: null }
			await new Promise((resolve, reject) => {
				this.pollVar.resolver = resolve

				if (pollCmd.cmd !== undefined) {
					if (this.poll_socket !== undefined && this.poll_socket.isConnected) {
						this.poll_socket.send(pollCmd.cmd + '\r\n')
						this.log('debug', 'Sent polling command: ' + pollCmd.cmd)
					} else {
						this.log('error', 'Socket not connected :(')
					}
				} else {
					this.log('error', 'Invalid polling command: ' + pollCmd.cmd)
				}
			})
			this.pollVar = undefined
			if ('runOnce' in pollCmd) {
				this.pollingCmds.splice(i, 1)
			}
		}
	}

	sendCommand(cmd) {
		if (cmd !== undefined) {
			if (this.socket !== undefined && this.socket.isConnected) {
				this.socket.send(cmd + '\r\n')
				this.log('debug', 'Sent Command: ' + cmd)
			} else {
				this.log('error', 'Socket not connected :(')
			}
		} else {
			this.log('error', 'Invalid command: ' + cmd)
		}
	}

	initPresets() {
		const presets = {}

		presets['inc_fader_level'] = {
			type: 'button',
			category: 'Fader Level',
			name: 'Inc Fader',
			style: {
				text: 'Fader +',
				size: '14',
				color: '16777215',
				bgcolor: 'rgb(0, 0, 0)',
			},
			steps: [
				{
					down: [
						{
							actionId: 'incFaderLevelTimer',
							options: {
								rate: '200',
								command: 'increment',
								instanceID: 'Level1',
								amount: 1,
							},
						},
					],
					up: [
						{
							actionId: 'incFaderLevelStop',
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['dec_fader_level'] = {
			type: 'button',
			category: 'Fader Level',
			name: 'Dec Fader',
			style: {
				text: 'Fader -',
				size: '14',
				color: '16777215',
				bgcolor: 'rgb(0, 0, 0)',
			},
			steps: [
				{
					down: [
						{
							actionId: 'incFaderLevelTimer',
							options: {
								rate: '200',
								command: 'decrement',
								instanceID: 'Level1',
								amount: 1,
							},
						},
					],
					up: [
						{
							actionId: 'incFaderLevelStop',
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['mute'] = {
			type: 'button',
			category: 'Mute',
			name: 'Mute',
			style: {
				text: 'Mute',
				size: '14',
				color: '16777215',
				bgcolor: 'rgb(0, 0, 0)',
			},
			steps: [
				{
					down: [
						{
							actionId: 'faderMute',
							options: {
								instanceID: 'Mute1',
								channel: 1,
								status: 'Mute',
							},
						},
					],
					up: [
						{
							actionId: 'faderMute',
							options: {
								instanceID: 'Mute1',
								channel: 1,
								status: 'Unmute',
							},
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['fader_level'] = {
			type: 'button',
			category: 'Fader Level',
			name: 'Set Fader To Level',
			style: {
				text: 'Fader1 Set To 0db',
				size: '14',
				color: '16777215',
				bgcolor: 'rgb(0, 0, 0)',
			},
			steps: [
				{
					down: [
						{
							actionId: 'setFaderLevel',
							options: {
								instanceID: 'Level1',
								channel: 1,
								level: 0,
							},
						},
					],
					up: [
						{
							actionId: 'incFaderLevelStop',
						},
					],
				},
			],
			feedbacks: [],
		}

		this.setPresetDefinitions(presets)
	}

	Fader_Change(command, deviceID, instanceID, channel, amount) {
		cmd = instanceID + ' ' + command + ' ' + 'level' + ' ' + channel + ' ' + amount
		this.sendCommand(cmd)
	}

	Fader_Timer(mode, rate, command, deviceID, instanceID, channel, amount) {
		if (this.TIMER_FADER !== null) {
			clearInterval(this.TIMER_FADER)
			this.TIMER_FADER = null
		}

		if (mode === 'start') {
			this.TIMER_FADER = setInterval(
				this.Fader_Change.bind(this),
				parseInt(rate),
				command,
				deviceID,
				instanceID,
				channel,
				amount,
			)
		}
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: 'This module will connect to a BiAmp Tesira Processor.',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'IP Address',
				width: 6,
				default: '192.168.0.1',
				regex: Regex.IP,
			},
			{
				type: 'textinput',
				id: 'pollinginterval',
				label: 'Polling interval in ms (for GET requests)',
				width: 6,
				default: '500',
				regex: Regex.NUMBER,
			},
		]
	}

	updateActions() {
		UpdateActions(this)
	}

	updateFeedbacks() {
		UpdateFeedbacks(this)
	}
}

runEntrypoint(TesiraInstance, UpgradeScripts)

// NEW TESIRA
//		https://support.biamp.com/Tesira/Control/Tesira_command_string_calculator
//		instance(ID or name) action attribute index1 (index2) Value
//		cmd = `${opt.instance} ${opt.action} ${opt.attribute}`
// eg cmd = Mute1 set mute 1 true
//          ID    set atrib
//
// Instance Tag		Command		Attribute	Index	Index				Value
// MyLevel1			subscribe	level		1		MyLevelCustomLabel	500
// ---------------------------------------------------------------------------------------------
