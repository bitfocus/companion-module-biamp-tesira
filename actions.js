module.exports = function (self) {
	self.setActionDefinitions({
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
			self.sendCommand(event.options.instanceID + " set level " + event.options.channel + " " + event.options.level);
		  	self.log("debug", "Set fader " + event.options.channel + " to level " + event.options.level);
		  }
		},
		incFaderLevel: {
		  name: "Increment/Decrement Fader Level",
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
			self.sendCommand(event.options.instanceID + " " + event.options.command + " level " + event.options.channel + " " + event.options.amount);
		  	self.log("Debug", event.options.command + " " + event.options.instanceID + " fader " + event.options.channel + " by " + event.options.amount);
		  }
		},
		incFaderLevelTimer: {
		  name: "Increase Fader Level 1 Point Continuously",
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
			self.Fader_Timer(
				"start",
				event.options.rate,
				event.options.command,
				event.options.deviceID,
				event.options.instanceID,
				event.options.channel,
				event.options.amount
			  );
		  	self.log("debug", "Start fader timer");
		  }
		},
		incFaderLevelStop: {
		  name: "Stop Increasing Fader Level",
		  callback: async (event) => {
			self.Fader_Timer("increase", "stop", null);
			self.log("debug", "Stop inc/dec fader level");
		  }
		},
		faderMute: {
		  name: "Fader Mute",
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
				{ id: "toggle", label: "Toggle" }
			  ],
			  default: "true",
			},
		  ],
		  callback: async (event) => {
			if(event.options.muteStatus == "toggle") {
				self.sendCommand(event.options.instanceID + " toggle mute " + event.options.channel);
			} else {
				self.sendCommand(event.options.instanceID + " set mute " + event.options.channel + " " + event.options.muteStatus);
			}
		  	self.log("debug", event.options.instanceID + " fader " + event.options.channel + " mute " + event.options.muteStatus);
		  }
		},
		recallPreset: {
		  name: "Recall Preset",
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
			self.sendCommand("DEVICE recallPreset " + event.options.presetID);
		  	self.log("info", "Recall preset " + event.options.presetID);
		  }
		},
		customCommand: {
		  name: "Custom Command",
		  options: [
			{
			  type: "static-text",
			  id: "info",
			  width: 12,
			  label:
				"BiAmp has created a command calculator to create custom command strings for the Tesira controllers. Unless you know what you are doing, it is strongly recommended that you use the calculator to create your command.",
			  value: "",
			},
			{
			  type: "static-text",
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
			self.sendCommand(event.options.command);
		  	self.log("info", "Custom command: " + event.options.command);
		  }
		},
	});
}
