module.exports = function (self) {
	self.setActionDefinitions({
		setFaderLevel: {
			name: 'Set Fader Level',
			options: [
				{
					type: 'textinput',
					id: 'instanceID',
					label: 'Instance ID',
					tooltip: 'Insert instance ID',
					default: 'Level1',
					width: 6,
				},
				{
					type: 'textinput',
					id: 'channel',
					label: 'Channel',
					tooltip: 'Insert Channel',
					default: '1',
					width: 6,
				},
				{
					type: 'number',
					label: 'Level',
					id: 'level',
					min: -100,
					max: 12,
					default: 0,
					required: true,
					range: true,
				},
			],
			callback: async (event) => {
				var rawCmd = event.options.instanceID + ' set level ' + event.options.channel + ' ' + event.options.level
				const cmd = await self.parseVariablesInString(rawCmd)
				self.sendCommand(cmd)
				self.log('debug', 'Set fader ' + event.options.channel + ' to level ' + event.options.level)
			},
		},
		incFaderLevel: {
			name: 'Increment/Decrement Fader Level',
			options: [
				{
					type: 'dropdown',
					label: 'Command',
					id: 'command',
					choices: [
						{ id: 'increment', label: 'Increment' },
						{ id: 'decrement', label: 'Decrement' },
					],
					default: 'increment',
				},
				{
					type: 'textinput',
					id: 'instanceID',
					label: 'Instance ID',
					tooltip: 'Insert instance ID',
					default: 'Level1',
					width: 6,
				},
				{
					type: 'textinput',
					id: 'channel',
					label: 'Channel',
					tooltip: 'Insert Channel',
					default: '1',
					width: 6,
				},
				{
					type: 'textinput',
					label: 'Increment/Decrement Amount',
					id: 'amount',
					default: 1,
					required: true,
				},
			],
			callback: async (event) => {
				var rawCmd =
					event.options.instanceID +
					' ' +
					event.options.command +
					' level ' +
					event.options.channel +
					' ' +
					event.options.amount
				const cmd = await self.parseVariablesInString(rawCmd)
				self.sendCommand(cmd)
				self.log(
					'Debug',
					event.options.command +
						' ' +
						event.options.instanceID +
						' fader ' +
						event.options.channel +
						' by ' +
						event.options.amount,
				)
			},
		},
		incFaderLevelTimer: {
			name: 'Increase Fader Level 1 Point Continuously',
			options: [
				{
					type: 'number',
					label: 'Rate',
					id: 'rate',
					default: '500',
					tooltip: 'Time in milliseconds between increases',
				},
				{
					type: 'dropdown',
					label: 'Command',
					id: 'command',
					choices: [
						{ id: 'increment', label: 'Increment' },
						{ id: 'decrement', label: 'Decrement' },
					],
					default: 'increment',
				},
				{
					type: 'textinput',
					id: 'instanceID',
					label: 'Instance ID',
					tooltip: 'Insert instance ID',
					default: 'Level1',
					width: 6,
				},
				{
					type: 'textinput',
					id: 'channel',
					label: 'Channel',
					tooltip: 'Insert Channel',
					default: '1',
					width: 6,
				},
				{
					type: 'textinput',
					label: 'Increment/Decrement Amount',
					id: 'amount',
					default: 1,
					required: true,
				},
			],
			callback: async (event) => {
				self.Fader_Timer(
					'start',
					event.options.rate,
					event.options.command,
					event.options.deviceID,
					event.options.instanceID,
					event.options.channel,
					event.options.amount,
				)
				self.log('debug', 'Start fader timer')
			},
		},
		incFaderLevelStop: {
			name: 'Stop Increasing Fader Level',
			callback: async (event) => {
				self.Fader_Timer('increase', 'stop', null)
				self.log('debug', 'Stop inc/dec fader level')
			},
		},
		faderMute: {
			name: 'Fader Mute',
			options: [
				{
					type: 'textinput',
					id: 'instanceID',
					label: 'Instance ID',
					tooltip: 'Insert instance ID',
					default: 'Level1',
					width: 6,
				},
				{
					type: 'textinput',
					id: 'channel',
					label: 'Channel',
					tooltip: 'Insert Channel',
					default: '1',
					width: 6,
				},
				{
					type: 'dropdown',
					label: 'Status',
					id: 'muteStatus',
					choices: [
						{ id: 'true', label: 'Mute' },
						{ id: 'false', label: 'Unmute' },
						{ id: 'toggle', label: 'Toggle' },
					],
					default: 'true',
				},
			],
			callback: async (event) => {
				if (event.options.muteStatus == 'toggle') {
					self.sendCommand(event.options.instanceID + ' toggle mute ' + event.options.channel)
				} else {
					self.sendCommand(
						event.options.instanceID + ' set mute ' + event.options.channel + ' ' + event.options.muteStatus,
					)
				}
				self.log(
					'debug',
					event.options.instanceID + ' fader ' + event.options.channel + ' mute ' + event.options.muteStatus,
				)
			},
		},
		recallPreset: {
			name: 'Recall Preset',
			options: [
				{
					type: 'textinput',
					id: 'presetID',
					label: 'Preset ID',
					tooltip: 'Insert preset ID',
					default: '1001',
					width: 6,
				},
			],
			callback: async (event) => {
				self.sendCommand('DEVICE recallPreset ' + event.options.presetID)
				self.log('info', 'Recall preset ' + event.options.presetID)
			},
		},
		customCommand: {
			name: 'Custom Command',
			options: [
				{
					type: 'static-text',
					id: 'info',
					width: 12,
					label:
						'BiAmp has created a command calculator to create custom command strings for the Tesira controllers. Unless you know what you are doing, it is strongly recommended that you use the calculator to create your command.',
					value: '',
				},
				{
					type: 'static-text',
					id: 'info',
					width: 12,
					label:
						'The calculator can be found here: https://support.biamp.com/Tesira/Control/Tesira_command_string_calculator',
					value: '',
				},
				{
					type: 'textinput',
					id: 'command',
					label: 'Command',
					tooltip: 'Insert Command Here',
					default: '1',
					width: 6,
					useVariables: true,
				},
				{
					type: 'checkbox',
					id: 'roundval',
					label: 'If a numeric value is returned, round to nearest whole number',
					default: true,
				},
			],
			callback: async (event) => {
				const cmd = await self.parseVariablesInString(event.options.command)

				//Check for subscribe/unsubscribe command
				var cmdTokens = cmd.split(' ')
				if (cmdTokens[1].toLowerCase() == 'subscribe') {
					var varName = cmdTokens.reverse()[1]
					var unsubCmd = cmd.replace(/\bsubscribe\b/, 'unsubscribe')

					// Track for rounding (upsert)
					var existingVarIdx = self.subscribeVars.findIndex((obj) => obj.name === varName)
					if (existingVarIdx > -1) {
						self.subscribeVars[existingVarIdx] = { name: varName, roundVal: event.options.roundval }
					} else {
						self.subscribeVars.push({ name: varName, roundVal: event.options.roundval })
					}

					// Track for reconnect (upsert)
					var existingSubIdx = self.subscriptions.findIndex((obj) => obj.varName === varName)
					if (existingSubIdx > -1) {
						self.subscriptions[existingSubIdx] = { varName, cmd, unsubCmd }
					} else {
						self.subscriptions.push({ varName, cmd, unsubCmd })
					}
				} else if (cmdTokens[1].toLowerCase() == 'unsubscribe') {
					var varName = cmdTokens.reverse()[0]

					let subIdx = self.subscriptions.findIndex((obj) => obj.varName === varName)
					if (subIdx > -1) {
						self.subscriptions.splice(subIdx, 1)
					}

					let varIdx = self.subscribeVars.findIndex((obj) => obj.name === varName)
					if (varIdx > -1) {
						self.subscribeVars.splice(varIdx, 1)
					}
				}

				//Now send the command
				self.sendCommand(cmd)
				self.log('info', 'Custom command: ' + event.options.command)
			},
		},
		customPolling: {
			name: 'Polling Parameter',
			options: [
				{
					type: 'static-text',
					id: 'info',
					width: 12,
					label:
						'This action will start polling using the specified command at a frequency set in the connection instance settings.',
					value: '',
				},
				{
					type: 'static-text',
					id: 'info',
					width: 12,
					label:
						'BiAmp has created a command calculator to create custom command strings for the Tesira controllers. Unless you know what you are doing, it is strongly recommended that you use the calculator to create your command.',
					value: '',
				},
				{
					type: 'static-text',
					id: 'info',
					width: 12,
					label:
						'The calculator can be found here: https://support.biamp.com/Tesira/Control/Tesira_command_string_calculator',
					value: '',
				},
				{
					type: 'textinput',
					id: 'command',
					label: 'Command',
					tooltip: "Insert 'GET' Command Here",
					default: '1',
					width: 15,
					useVariables: true,
				},
				{
					type: 'textinput',
					id: 'customvar',
					label: 'Custom Variable',
					tooltip: "Custom variable name to store result of 'GET' command",
					default: 'MyCustomVar',
					width: 15,
				},
				{
					type: 'checkbox',
					id: 'roundval',
					label: 'Round numeric values to nearest whole number',
					default: true,
				},
			],
			callback: async (event) => {
				const cmd = await self.parseVariablesInString(event.options.command)
				self.pollingCmds.push({ varName: event.options.customvar, roundVal: event.options.roundval, cmd: cmd })
				self.log('info', 'Custom polling command (' + event.options.customvar + '): ' + event.options.command)
			},
		},
		removeCustomPolling: {
			name: 'Cancel Polling Parameter',
			options: [
				{
					type: 'static-text',
					id: 'info',
					width: 12,
					label: 'This will cancel recurring polling of the specified variable.',
					value: '',
				},
				{
					type: 'textinput',
					id: 'customvar',
					label: 'Custom Variable',
					tooltip: 'Custom variable name to cancel polling',
					default: 'MyCustomVar',
					width: 15,
				},
			],
			callback: async (event) => {
				let customVarIdx = self.pollingCmds.findIndex((obj) => obj.varName === event.options.customvar)
				if (customVarIdx > -1) {
					self.pollingCmds.splice(customVarIdx, 1)
				}
				self.log('info', 'Cancel custom polling (' + event.options.customvar + ')')
			},
		},
		pollOnce: {
			name: 'Get parameter value',
			options: [
				{
					type: 'static-text',
					id: 'info',
					width: 12,
					label:
						'BiAmp has created a command calculator to create custom command strings for the Tesira controllers. Unless you know what you are doing, it is strongly recommended that you use the calculator to create your command.',
					value: '',
				},
				{
					type: 'static-text',
					id: 'info',
					width: 12,
					label:
						'The calculator can be found here: https://support.biamp.com/Tesira/Control/Tesira_command_string_calculator',
					value: '',
				},
				{
					type: 'static-text',
					id: 'info',
					width: 12,
					label: 'This action will check a parameter value once and store it in the specified custom variable name.',
					value: '',
				},
				{
					type: 'textinput',
					id: 'command',
					label: 'Command',
					tooltip: "Insert 'GET' Command Here",
					default: '1',
					width: 15,
					useVariables: true,
				},
				{
					type: 'textinput',
					id: 'customvar',
					label: 'Custom Variable',
					tooltip: "Custom variable name to store result of 'GET' command",
					default: 'MyCustomVar',
					width: 15,
				},
				{
					type: 'checkbox',
					id: 'roundval',
					label: 'Round numeric values to nearest whole number',
					default: true,
				},
			],
			callback: async (event) => {
				const cmd = await self.parseVariablesInString(event.options.command)
				self.pollingCmds.push({
					varName: event.options.customvar,
					roundVal: event.options.roundval,
					cmd: cmd,
					runOnce: true,
				})
				self.log('info', 'Poll once command (' + event.options.customvar + '): ' + event.options.command)
			},
		},
		subscribeParameter: {
			name: 'Subscribe to Parameter',
			options: [
				{
					type: 'static-text',
					id: 'info',
					width: 12,
					label:
						'Subscribe to a parameter so the Tesira pushes updates automatically when the value changes. Much more responsive than polling.',
					value: '',
				},
				{
					type: 'textinput',
					id: 'instanceID',
					label: 'Instance Tag',
					tooltip: 'Instance Tag of the block (e.g. MyMatrix)',
					default: 'Level1',
					width: 6,
					useVariables: true,
				},
				{
					type: 'textinput',
					id: 'attribute',
					label: 'Attribute',
					tooltip: 'Attribute name - case sensitive (e.g. level, mute, crosspointLevelState)',
					default: 'level',
					width: 6,
					useVariables: true,
				},
				{
					type: 'textinput',
					id: 'index',
					label: 'Index',
					tooltip: 'Index value (e.g. channel number)',
					default: '1',
					width: 6,
					useVariables: true,
				},
				{
					type: 'textinput',
					id: 'customvar',
					label: 'Variable Name',
					tooltip: 'Custom variable name to store the value (also used as publishToken)',
					default: 'MyVar',
					width: 6,
				},
				{
					type: 'textinput',
					id: 'rate',
					label: 'Rate (ms)',
					tooltip: 'Minimum update interval in milliseconds',
					default: '500',
					width: 6,
				},
				{
					type: 'checkbox',
					id: 'roundval',
					label: 'Round numeric values to nearest whole number',
					default: true,
				},
				{
					type: 'checkbox',
					id: 'getInitial',
					label: 'Get initial value on subscribe',
					default: true,
				},
			],
			callback: async (event) => {
				const instanceID = (await self.parseVariablesInString(event.options.instanceID)).trim()
				const attribute = (await self.parseVariablesInString(event.options.attribute)).trim()
				const index = (await self.parseVariablesInString(event.options.index)).trim()
				const varName = event.options.customvar.trim()
				const rate = event.options.rate.trim()

				if (!varName) {
					self.log('error', 'Subscribe: Variable Name cannot be empty')
					return
				}

				const cmd = instanceID + ' subscribe ' + attribute + ' ' + index + ' "' + varName + '" ' + rate
				const unsubCmd = instanceID + ' unsubscribe ' + attribute + ' ' + index + ' "' + varName + '"'

				// Update or add tracking for rounding (prevent duplicates)
				const existingVarIdx = self.subscribeVars.findIndex((obj) => obj.name === varName)
				if (existingVarIdx > -1) {
					self.subscribeVars[existingVarIdx] = { name: varName, roundVal: event.options.roundval }
				} else {
					self.subscribeVars.push({ name: varName, roundVal: event.options.roundval })
				}

				// Update or add tracking for reconnect (prevent duplicates)
				const existingSubIdx = self.subscriptions.findIndex((obj) => obj.varName === varName)
				if (existingSubIdx > -1) {
					self.subscriptions[existingSubIdx] = { varName, cmd, unsubCmd }
				} else {
					self.subscriptions.push({ varName, cmd, unsubCmd })
				}

				self.sendCommand(cmd)
				self.log('info', 'Subscribed to ' + varName + ': ' + cmd)

				// Get initial value via poll queue
				if (event.options.getInitial) {
					const getCmd = instanceID + ' get ' + attribute + ' ' + index
					self.pollingCmds.push({
						varName: varName,
						roundVal: event.options.roundval,
						cmd: getCmd,
						runOnce: true,
					})
					self.debugLog('Queued initial GET: ' + getCmd)
				}
			},
		},
		unsubscribeParameter: {
			name: 'Unsubscribe from Parameter',
			options: [
				{
					type: 'textinput',
					id: 'instanceID',
					label: 'Instance Tag',
					tooltip: 'Instance Tag of the block',
					default: 'Level1',
					width: 6,
					useVariables: true,
				},
				{
					type: 'textinput',
					id: 'attribute',
					label: 'Attribute',
					tooltip: 'Attribute name',
					default: 'level',
					width: 6,
					useVariables: true,
				},
				{
					type: 'textinput',
					id: 'index',
					label: 'Index',
					tooltip: 'Index value',
					default: '1',
					width: 6,
					useVariables: true,
				},
				{
					type: 'textinput',
					id: 'customvar',
					label: 'Variable Name',
					tooltip: 'The variable name / publishToken used when subscribing',
					default: 'MyVar',
					width: 6,
				},
			],
			callback: async (event) => {
				const varName = event.options.customvar.trim()

				// Use stored unsubCmd to ensure it exactly matches what was subscribed
				let subIdx = self.subscriptions.findIndex((obj) => obj.varName === varName)
				if (subIdx > -1) {
					self.sendCommand(self.subscriptions[subIdx].unsubCmd)
					self.subscriptions.splice(subIdx, 1)
				} else {
					// Fallback: reconstruct command if not tracked (e.g. subscribed via customCommand)
					const instanceID = (await self.parseVariablesInString(event.options.instanceID)).trim()
					const attribute = (await self.parseVariablesInString(event.options.attribute)).trim()
					const index = (await self.parseVariablesInString(event.options.index)).trim()
					self.sendCommand(instanceID + ' unsubscribe ' + attribute + ' ' + index + ' "' + varName + '"')
				}

				let varIdx = self.subscribeVars.findIndex((obj) => obj.name === varName)
				if (varIdx > -1) {
					self.subscribeVars.splice(varIdx, 1)
				}

				self.log('info', 'Unsubscribed from ' + varName)
			},
		},
	})
}
