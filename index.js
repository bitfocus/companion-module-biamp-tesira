// BiAmp Tesira

var tcp = require("../../tcp");
var instance_skel = require("../../instance_skel");
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

instance.prototype.init_tcp = function () {
  let self = this;

  if (self.socket !== undefined) {
    self.socket.destroy();
    delete self.socket;
  }

  self.config.port = 23;

  if (self.config.host && self.config.port) {
    self.socket = new tcp(self.config.host, self.config.port);

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
};

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
    case "customCommand":
      cmd = options.command;
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

// ---------------------------------------------------------------------------------------------
// OLD AUDIA
// 	   cmd = opt.action opt.device opt.attribute opt.instance opt.index1 opt.index2 opt.value
// eg  cmd = set 0 MBMUTE 99 1 1
//
//		action = get/set/etc
//		device = deviceid (not needed for tesira)
//		attribute = MBMUTE SETLEVEL etc
//		instance = insatance ID of block
//		opt.index1 = what channel you want to controllers
//		opt.index2 = 2nd index to controllers (used for things like routers)
//		opt.value = what the value is
//
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
