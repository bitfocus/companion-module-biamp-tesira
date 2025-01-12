module.exports = function (self) {
	self.setActionDefinitions({
		sample_action: {
			name: 'My First Action',
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Test',
					default: 5,
					min: 0,
					max: 100,
				},
			],
			callback: async (event) => {
				console.log('Hello world!', event.options.num)
			},
		},
	})


	self.setActions({
		setFaderLevel: {
		  name: "Set Fader Level",
		  options: [
			{
			  type: "textinput",
			  id: "instanceID",
			  label: "Instance ID",
			  tooltip: "Insert instance ID",
			  default: "Level1",
			  width: 6,
			},
			{
			  type: "textinput",
			  id: "channel",
			  label: "Channel",
			  tooltip: "Insert Channel",
			  default: "1",
			  width: 6,
			},
			{
			  type: "number",
			  label: "Level",
			  id: "level",
			  min: -100,
			  max: 12,
			  default: 0,
			  required: true,
			  range: true,
			},
		  ],
		  callback: async (event) => {
			this.sendCommand(event.options.instanceID + " set level " + event.options.channel + " " + event.options.level);
		  	console.log("Set fader level");
		  }
		},
		incFaderLevel: {
		  label: "Increment/Decrement Fader Level",
		  options: [
			{
			  type: "dropdown",
			  label: "Command",
			  id: "command",
			  choices: [
				{ id: "increment", label: "Increment" },
				{ id: "decrement", label: "Decrement" },
			  ],
			  default: "increment",
			},
			{
			  type: "textinput",
			  id: "instanceID",
			  label: "Instance ID",
			  tooltip: "Insert instance ID",
			  default: "Level1",
			  width: 6,
			},
			{
			  type: "textinput",
			  id: "channel",
			  label: "Channel",
			  tooltip: "Insert Channel",
			  default: "1",
			  width: 6,
			},
			{
			  type: "textinput",
			  label: "Increment/Decrement Amount",
			  id: "amount",
			  default: 1,
			  required: true,
			},
		  ],
		  callback: async (event) => {
			this.sendCommand(event.options.instanceID + " " + event.options.command + " level " + event.options.channel + " " + event.options.amount);
		  	console.log("Inc/dec fader level");
		  }
		},
		incFaderLevelTimer: {
		  label: "Increase Fader Level 1 Point Continuously",
		  options: [
			{
			  type: "number",
			  label: "Rate",
			  id: "rate",
			  default: "500",
			  tooltip: "Time in milliseconds between increases",
			},
			{
			  type: "dropdown",
			  label: "Command",
			  id: "command",
			  choices: [
				{ id: "increment", label: "Increment" },
				{ id: "decrement", label: "Decrement" },
			  ],
			  default: "increment",
			},
			{
			  type: "textinput",
			  id: "instanceID",
			  label: "Instance ID",
			  tooltip: "Insert instance ID",
			  default: "Level1",
			  width: 6,
			},
			{
			  type: "textinput",
			  id: "channel",
			  label: "Channel",
			  tooltip: "Insert Channel",
			  default: "1",
			  width: 6,
			},
			{
			  type: "textinput",
			  label: "Increment/Decrement Amount",
			  id: "amount",
			  default: 1,
			  required: true,
			},
		  ],
		  callback: async (event) => {
			this.Fader_Timer(
				"start",
				event.options.rate,
				event.options.command,
				event.options.deviceID,
				event.options.instanceID,
				event.options.channel,
				event.options.amount
			  );
		  	console.log("Start fader timer");
		  }
		},
		incFaderLevelStop: {
		  label: "Stop Increasing Fader Level",
		  callback: async (event) => {
			this.Fader_Timer("increase", "stop", null);
			console.log("Stop inc/dec fader level");
		  }
		},
		faderMute: {
		  label: "Fader Mute",
		  options: [
			{
			  type: "textinput",
			  id: "instanceID",
			  label: "Instance ID",
			  tooltip: "Insert instance ID",
			  default: "Level1",
			  width: 6,
			},
			{
			  type: "textinput",
			  id: "channel",
			  label: "Channel",
			  tooltip: "Insert Channel",
			  default: "1",
			  width: 6,
			},
			{
			  type: "dropdown",
			  label: "Status",
			  id: "muteStatus",
			  choices: [
				{ id: "true", label: "Mute" },
				{ id: "false", label: "Unmute" },
			  ],
			  default: "true",
			},
		  ],
		  callback: async (event) => {
			this.sendCommand(event.options.instanceID + " set mute " + event.options.channel + " " + event.options.muteStatus);
		  	console.log("Fader mute");
		  }
		},
		recallPreset: {
		  label: "Recall Preset",
		  options: [
			{
			  type: "textinput",
			  id: "presetID",
			  label: "Preset ID",
			  tooltip: "Insert preset ID",
			  default: "1001",
			  width: 6,
			}
		  ],
		  callback: async (event) => {
			this.sendCommand("DEVICE recallPreset " + event.options.presetID);
		  	console.log("Recall preset");
		  }
		},
		customCommand: {
		  label: "Custom Command",
		  options: [
			{
			  type: "text",
			  id: "info",
			  width: 12,
			  label:
				"BiAmp has created a command calculator to create custom command strings for the Tesira controllers. Unless you know what you are doing, it is strongly recommended that you use the calculator to create your command.",
			  value: "",
			},
			{
			  type: "text",
			  id: "info",
			  width: 12,
			  label:
				"The calculator can be found here: https://support.biamp.com/Tesira/Control/Tesira_command_string_calculator",
			  value: "",
			},
			{
			  type: "textinput",
			  id: "command",
			  label: "Command",
			  tooltip: "Insert Command Here",
			  default: "1",
			  width: 6,
			},
		  ],
		  callback: async (event) => {
			this.sendCommand(event.options.command);
		  	console.log("Custom command: " + event.options.command);
		  }
		},
	});
}
