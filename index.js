// BiAmp Tesira

var tcp = require("../../tcp");
var instance_skel = require("../../instance_skel");
var TelnetSocket = require('../../telnet');
const { slice } = require("lodash");
var debug;
var log;

function instance(system, id, config) {
  let self = this;

  // super-constructor
  instance_skel.apply(this, arguments);

  self.actions(); // export actions

  return self;
}

instance.prototype.TIMER_FADER = null;

instance.prototype.updateConfig = function (config) {
  let self = this;

  self.config = config;
  self.initPresets();
  self.init_tcp();
};

instance.prototype.init = function () {
  let self = this;

  debug = console.log;
  log = console.log;
  self.initPresets();
  self.init_tcp();
};

//based on code from the extron smx module -- 
//process data received from the telnet connection
instance.prototype.incomingData = function(data) {
	var self = this;
	debug(data);

	// Match part of the response from unit when a connection is made.
	if (self.login === false && data.match(/Welcome to the Tesira Text Protocol Server/)) {
		self.status(self.STATUS_OK);
		debug("Logged in");
	}

//capture subscription responses into custom variables (example:! "publishToken":"MyLevelCustomLabel" "value":-100.0000)
//regEx to capture label and value:  /! \"publishToken\":\"(\w*)\" \"value\":(.*)/gm

if (data.match(/! \"publishToken\":\"\w*\" \"value\":.*/)) {
  match = data.match(/! \"publishToken\":\"(\w*)\" \"value\":(.*)/);
  
  //remove all the useless trailing zeros from number values
  value = match[2];
  if (value.indexOf('.') > 0) {
    value = value.slice(0,value.indexOf('.'));
  }
  
  self.setVariable(match[1],value);
  console.log("variable set - "+ match[1] + " = " + value);

 //TO DO:  figure this out -- only set variable definitions one time when a new variable is first created
 // I believe the name must match the var-name, and description should just be 'return value from tesira'

  //self.setVariableDefinitions(newvar); I *think* newvar needs to be an object in the form {name: <varname>,label: 'return value from tesira'}
}


};

instance.prototype.init_tcp = function () {
  let self = this;

  if (self.socket !== undefined) {
    self.socket.destroy();
    delete self.socket;
  }

  self.config.port = 23;

  if (self.config.host && self.config.port) {
    self.socket = new TelnetSocket(self.config.host, self.config.port);

    self.socket.on("status_change", function (status, message) {
      self.status(status, message);
    });

    self.socket.on("error", function (err) {
      debug("Network error", err);
      self.log("error", "Network error: " + err.message);
    });

    self.socket.on("connect", function () {
      debug("Socket Connected");
    });
  } else {
    self.log("error", "Please specify host in config.");
  }
    //capture incoming data
    self.socket.on("data", function(buffer) {
      var indata = buffer.toString("utf8");
      self.incomingData(indata);
    });
    //respond to telnet option negotiation, decline everything
    self.socket.on("iac", function(type, info) {
			// tell remote we WONT do anything we're asked to DO
			if (type == 'DO') {
				self.socket.write(Buffer.from([ 255, 252, info ]));
			}

			// tell the remote DONT do whatever they WILL offer
			if (type == 'WILL') {
				self.socket.write(Buffer.from([ 255, 254, info ]));
			}
		});
};
//instance.prototype.addVariable = function (testvar) { // this causes a crash!
//  var self = this;
//  test = self.getVariable(testvar);
//  console.log("checking new variable -->" + test);
//TO DO:  find a way to manage the custom variables that we're setting up based on return values from tesira.  add definitions so that they show up to the user

instance.prototype.initPresets = function () {
  var self = this;
  var presets = [];

  presets.push({
    category: "Fader Level",
    label: "Inc Fader",
    bank: {
      style: "text",
      text: "Fader +",
      size: "14",
      color: "16777215",
      bgcolor: self.rgb(0, 0, 0),
    },
    actions: [
      {
        action: "incFaderLevelTimer",
        options: {
          rate: "200",
          command: "increment",
          instanceID: "Level1",
          amount: 1,
        },
      },
    ],
    release_actions: [
      {
        action: "incFaderLevelStop",
      },
    ],
  });

  presets.push({
    category: "Fader Level",
    label: "Dec Fader",
    bank: {
      style: "text",
      text: "Fader -",
      size: "14",
      color: "16777215",
      bgcolor: self.rgb(0, 0, 0),
    },
    actions: [
      {
        action: "incFaderLevelTimer",
        options: {
          rate: "200",
          command: "decrement",
          instanceID: "Level1",
          amount: 1,
        },
      },
    ],
    release_actions: [
      {
        action: "incFaderLevelStop",
      },
    ],
  });

  presets.push({
    category: "Mute",
    label: "Mute",
    bank: {
      style: "text",
      text: "Mute",
      size: "14",
      color: "16777215",
      bgcolor: self.rgb(0, 0, 0),
    },
    actions: [
      {
        action: "faderMute",
        options: {
          instanceID: "Mute1",
          channel: 1,
          status: "Mute",
        },
      },
    ],
    release_actions: [
      {
        action: "faderMute",
        options: {
          instanceID: "Mute1",
          channel: 1,
          status: "Unmute",
        },
      },
    ],
  });

  presets.push({
    category: "Fader Level",
    label: "Set Fader To Level",
    bank: {
      style: "text",
      text: "Fader1 Set To 0db",
      size: "14",
      color: "16777215",
      bgcolor: self.rgb(0, 0, 0),
    },
    actions: [
      {
        action: "setFaderLevel",
        options: {
          instanceID: "Level1",
          channel: 1,
          level: 0,
        },
      },
    ],
    release_actions: [
      {
        action: "incFaderLevelStop",
      },
    ],
  });

  self.setPresetDefinitions(presets);
};

// Return config fields for web config
instance.prototype.config_fields = function () {
  let self = this;

  return [
    {
      type: "text",
      id: "info",
      label: "",
      width: 12,
      value: `
				<div class="alert alert-danger">
					<h4>ACTION REQUESTS</h4>
					<div>
						<strong>If you want to use an action that requires the use of a custom command, please submit a issue request to the module repo with the action that you would like added to the module.</strong>
						<a href="https://github.com/bitfocus/companion-module-biamp-tesira/issues" target="_new" class="btn btn-success">Module Issues Page</a>
					</div>
				</div>
			`,
    },
    {
      type: "text",
      id: "info",
      width: 12,
      label: "Information",
      value: "This module will connect to a BiAmp Tesira Processor.",
    },
    {
      type: "textinput",
      id: "host",
      label: "IP Address",
      width: 6,
      default: "192.168.0.1",
      regex: self.REGEX_IP,
    },
  ];
};

// When module gets deleted
instance.prototype.destroy = function () {
  let self = this;

  if (self.socket !== undefined) {
    self.socket.destroy();
  }

  //destroy timers
  if (self.TIMER_FADER !== null) {
    clearInterval(this.TIMER_FADER);
    self.TIMER_FADER = null;
  }

  debug("destroy", self.id);
};

instance.prototype.actions = function () {
  let self = this;

  self.setActions({
    setFaderLevel: {
      label: "Set Fader Level",
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
    },
    incFaderLevelStop: {
      label: "Stop Increasing Fader Level",
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
    },
  });
};

instance.prototype.action = function (action) {
  let self = this;
  let cmd;
  let options = action.options;
  let muteInt;

  console.log("Tesira Command Sent:");

  switch (action.action) {
    case "setFaderLevel":
      cmd =
        options.instanceID +
        " " +
        "set" +
        " " +
        "level" +
        " " +
        options.channel +
        " " +
        options.level;
      console.log(cmd);
      break;
    case "faderMute":
      cmd =
        options.instanceID +
        " " +
        "set" +
        " " +
        "mute" +
        " " +
        options.channel +
        " " +
        options.muteStatus;
      console.log(cmd);
      break;
    case "incFaderLevelTimer":
      self.Fader_Timer(
        "start",
        options.rate,
        options.command,
        options.deviceID,
        options.instanceID,
        options.channel,
        options.amount
      );
      break;
    case "incFaderLevelStop":
      self.Fader_Timer("increase", "stop", null);
      break;
    case "recallPreset":
      cmd = "DEVICE recallPreset " + 
      options.presetID;
      break;
    case "customCommand":
      cmd = options.command;
      break;
    case "incFaderLevel":
      cmd = options.instanceID +
      " " +
      options.command +
      " " +
      "level" +
      " " +
      options.channel +
      " " +
      options.amount;
      break;
  }

  if (cmd !== undefined) {
    if (self.socket !== undefined && self.socket.connected) {
      self.socket.send(cmd + "\r\n");
      debug("Sent Command: " + cmd);
    } else {
      debug("Socket not connected :(");
    }
  } else {
    self.log("error", "Invalid command: " + cmd);
  }
};

instance.prototype.Fader_Change = function (
  command,
  deviceID,
  instanceID,
  channel,
  amount
) {
  let self = this;

  cmd =
    instanceID + " " + command + " " + "level" + " " + channel + " " + amount;

  if (cmd !== undefined) {
    if (self.socket !== undefined && self.socket.connected) {
      self.socket.send(cmd + "\r\n");
      debug("Sent Command: " + cmd);
    } else {
      debug("Socket not connected :(");
    }
  } else {
    self.log("error", "Invalid command: " + cmd);
  }
};

instance.prototype.Fader_Timer = function (
  mode,
  rate,
  command,
  deviceID,
  instanceID,
  channel,
  amount
) {
  let self = this;

  if (self.TIMER_FADER !== null) {
    clearInterval(self.TIMER_FADER);
    self.TIMER_FADER = null;
  }

  if (mode === "start") {
    self.TIMER_FADER = setInterval(
      self.Fader_Change.bind(self),
      parseInt(rate),
      command,
      deviceID,
      instanceID,
      channel,
      amount
    );
  }
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;


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
