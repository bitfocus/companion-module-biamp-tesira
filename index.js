// ---------------------------------------------------------
// Based on the audia module with mostly basic modifications to get it cranking on the Tesira range
// ---------------------------------------------------------

var tcp = require("../../tcp");
var instance_skel = require("../../instance_skel");
var debug;
var log;

// All the setup stuff goes here
function instance(system, id, config) {
  var self = this;

  // super-constructor
  instance_skel.apply(this, arguments);

  self.actions(); // export actions

  return self;
}

instance.prototype.updateConfig = function (config) {
  var self = this;

  self.config = config;
  self.init_tcp();
};

instance.prototype.init = function () {
  var self = this;

  debug = self.debug;
  log = self.log;

  self.status(1, "Connecting"); // status ok!

  self.init_tcp();
};

// All the TCP communication stuff startup goes next

instance.prototype.init_tcp = function () {
  var self = this;

  if (self.socket !== undefined) {
    self.socket.destroy();
    delete self.socket;
  }

  if (self.config.host) {
    self.socket = new tcp(self.config.host, self.config.port);

    self.socket.on("status_change", function (status, message) {
      self.status(status, message);
    });

    self.socket.on("error", function (err) {
      debug("Network error", err);
      self.status(self.STATE_ERROR, err);
      self.log("error", "Network error: " + err.message);
    });

    self.socket.on("connect", function () {
      self.status(self.STATE_OK);
      debug("Connected");
    });

    self.socket.on("data", function (data) {});
  }
};

// Return config fields for web config - This stuff is for the module EDIT config page in companion
instance.prototype.config_fields = function () {
  var self = this;
  return [
    {
      type: "textinput",
      id: "host",
      label: "Target IP",
      width: 6,
      regex: self.REGEX_IP,
    },
    {
      type: "textinput",
      id: "port",
      label: "Target Port",
      witdth: 6,
      default: 23,
      regex: self.REGEX_PORT,
    },
  ];
};

// Do this when the module gets deleted
instance.prototype.destroy = function () {
  var self = this;

  if (self.socket !== undefined) {
    self.socket.destroy();
  }

  debug("destroy", self.id);
};

// These are the options that the end-user can select when creating buttons and automations

instance.prototype.actions = function (system) {
  var self = this;

  self.system.emit("instance_actions", self.id, {
    // Preset Recall
    "recall-preset": {
      label: "Recall a preset",
      options: [
        {
          type: "dropdown",
          label: "Direction",
          id: "action",
          choices: [
            { id: "recallPreset", label: "Recall By ID (1001 or higher)" },
            { id: "recallPresetByName", label: "Recall By Name" },
          ],
        },
        {
          type: "textinput",
          label: "Preset Name or ID",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },

    // Fader Control - inc dec
    "fader-step": {
      label: "[Fader] Increment/Decrement",
      options: [
        {
          type: "textinput",
          label: "Instance tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Channel",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "Direction",
          id: "action",
          choices: [
            { id: "increment", label: "Increment" },
            { id: "decrement", label: "Decrement" },
          ],
        },
        {
          type: "textinput",
          label: "Amount",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },

    // Fader Control - set the level value directly
    "fader-set": {
      label: "[Fader] set",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Channel",
          id: "index1",
          default: 1,
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Value",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },

    // fader mute
    "fadermute-set": {
      label: "[Fader] set Mute",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Channel",
          id: "index1",
          default: 1,
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Unmuted" },
            { id: "true", label: "Muted" },
          ],
        },
      ],
    },

    // mute in blocks that support mute
    "mutebutton-set": {
      label: "[Mute] set Mute",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Channel",
          id: "index1",
          default: 1,
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Unmuted" },
            { id: "true", label: "Muted" },
          ],
        },
      ],
    },

    // Router set output to input
    "router-set": {
      label: "[Router] set Crosspoint",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Output",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Input",
          id: "index2",
          regex: self.REGEX_NUMBER,
        },
      ],
    },

    // Source Block Select
    "source-set": {
      label: "[Source Selection] set Source",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Source",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
      ],
    },

    // Source Volume Set (per input)
    "sourcevolume-set": {
      label: "[Source Selection] set Input Volume",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Input",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Level",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },

    // Leveler/Compressor/Peak Limiter/Ducker/Noise Gate/AGC Bypass
    "leveler-set": {
      label: "Leveler/Compressor/Peak Limiter/Ducker/Noise Gate/AGC set Bypass",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Active" },
            { id: "true", label: "Bypassed" },
          ],
        },
      ],
    },

    // input level set for all blocks
    "inputlevel-set": {
      label: "Input Level",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Level",
          id: "value",
        },
      ],
    },

    // level sence set - for dynamics processor - ducker
    "duckerlevelsense-set": {
      label: "[Ducker] set Level Sense",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Level",
          id: "value",
        },
      ],
    },

    // MUTE - set ducker sence mute
    "duckersensemute-set": {
      label: "[Ducker] set Sense Mute",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Unmuted" },
            { id: "true", label: "Muted" },
          ],
        },
      ],
    },

    // MUTE - set input mute
    "inputmute-set": {
      label: "[Input] set Mute",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Unmuted" },
            { id: "true", label: "Muted" },
          ],
        },
      ],
    },

    // ----------------------------------------------------------------------------------
    // This is for next revision
    // ----------------------------------------------------------------------------------

    "xover2-set": {
      label: "[2-Way Crossover] Edit",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "Filter Point",
          id: "index1",
          choices: [
            { id: "1", label: "Low-Pass Cutoff" },
            { id: "2", label: "High-Pass Cutoff" },
          ],
        },
        {
          type: "textinput",
          label: "Frequency",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "xover3-set": {
      label: "[3-Way Crossover] Edit",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "Filter Point",
          id: "index1",
          choices: [
            { id: "1", label: "Low-Pass Cutoff" },
            { id: "2", label: "Middle Low Cutoff" },
            { id: "3", label: "Middle High Cutoff" },
            { id: "2", label: "High-Pass Cutoff" },
          ],
        },
        {
          type: "textinput",
          label: "Frequency",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "xover4-set": {
      label: "[4-Way Crossover] Edit",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "Filter Point",
          id: "index1",
          choices: [
            { id: "1", label: "Low-Pass Cutoff" },
            { id: "2", label: "Low-Mid Low Cutoff" },
            { id: "3", label: "Low-Mid High Cutoff" },
            { id: "4", label: "High-Mid Low Cutoff" },
            { id: "5", label: "High-Mid High Cutoff" },
            { id: "6", label: "High-Pass Cutoff" },
          ],
        },
        {
          type: "textinput",
          label: "Frequency",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "hpfcutoff-set": {
      label: "[HPF] set Cutoff",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Frequency",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "hpfbypass-set": {
      label: "[HPF] set Bypass",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Active" },
            { id: "true", label: "Bypassed" },
          ],
        },
      ],
    },
    "lpfcutoff-set": {
      label: "[LPF] set Cutoff",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Frequency",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "lpfbypass-set": {
      label: "[LPF] set Bypass",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Active" },
            { id: "true", label: "Bypassed" },
          ],
        },
      ],
    },

    "highshelfcutoff-set": {
      label: "[High Shelf] set Cutoff",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Frequency",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "highshelfgain-set": {
      label: "[High Shelf] set Gain",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Gain",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "highshelfbypass-set": {
      label: "[High Shelf] set Bypass",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Active" },
            { id: "true", label: "Bypassed" },
          ],
        },
      ],
    },
    "lowshelfcutoff-set": {
      label: "[Low Shelf] set Cutoff",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Frequency",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "lowshelfgain-set": {
      label: "[Low Shelf] set Gain",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Gain",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "lowshelfbypass-set": {
      label: "[Low Shelf] set Bypass",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Active" },
            { id: "true", label: "Bypassed" },
          ],
        },
      ],
    },
    "allpassbypass-set": {
      label: "[All Pass] set Bypass (All)",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Active" },
            { id: "true", label: "Bypassed" },
          ],
        },
      ],
    },
    "allpassbypassband-set": {
      label: "[All Pass] set Bypass (Band)",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Band",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Active" },
            { id: "true", label: "Bypassed" },
          ],
        },
      ],
    },
    "allpasscenter-set": {
      label: "[All Pass] set Center (Band)",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Band",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Frequency",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "allpassbw-set": {
      label: "[All Pass] set Bandwidth (Band)",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Band",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Bandwidth",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "geqlevel-set": {
      label: "[GEQ] set Level (Band)",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Band",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Level",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "geqbypass-set": {
      label: "[GEQ] set Bypass",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Active" },
            { id: "true", label: "Bypassed" },
          ],
        },
      ],
    },
    "peqbypass-set": {
      label: "[PEQ] set Bypass (All)",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Active" },
            { id: "true", label: "Bypassed" },
          ],
        },
      ],
    },
    "peqbypassband-set": {
      label: "[PEQ] set Bypass (Band)",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Band",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Active" },
            { id: "true", label: "Bypassed" },
          ],
        },
      ],
    },
    "peqcenter-set": {
      label: "[PEQ] set Center (Band)",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Band",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Frequency",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "peqpassbw-set": {
      label: "[PEQ] set Bandwidth (Band)",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Band",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Bandwidth",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    "peqlevel-set": {
      label: "[PEQ] set Level (Band)",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Band",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Level",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },
    // ----------------------------------------------------------------------------------
    // Aaaaand were back into things for v1.0
    // ----------------------------------------------------------------------------------

    // Gain set for any analogiue input block that has a gain control
    "gain-set": {
      label: "[Input] set Gain",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Channel",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "Gain",
          id: "value",
          choices: [
            { id: "0", label: "0 dB" },
            { id: "6", label: "6 dB" },
            { id: "12", label: "12 dB" },
            { id: "18", label: "18 dB" },
            { id: "24", label: "24 dB" },
            { id: "30", label: "30 dB" },
            { id: "36", label: "36 dB" },
            { id: "42", label: "42 dB" },
            { id: "48", label: "48 dB" },
            { id: "54", label: "54 dB" },
            { id: "60", label: "60 dB" },
            { id: "66", label: "66 dB" },
          ],
        },
      ],
    },
    // Level set for any block that has a level control
    "level-set": {
      label: "[Level] set Level",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Channel",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Level",
          id: "value",
          regex: self.REGEX_NUMBER,
        },
      ],
    },

    // Phantom Power set for any analogue input block that can supply phantom power
    "phantom-set": {
      label: "[Input] set Phantom Power",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Chanel",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "State",
          id: "value",
          choices: [
            { id: "false", label: "Off" },
            { id: "true", label: "On" },
          ],
        },
      ],
    },

    // Phase Invert / Polarity Invert / Phase Flip - you know the deal - get the phase right on inputs
    "polarity-set": {
      label: "[Analog In] set Polarity",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Channel",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "Polarity",
          id: "value",
          choices: [
            { id: "false", label: "Normal" },
            { id: "true", label: "Inverted" },
          ],
        },
      ],
    },

    // Turn AEC on and off
    "aecenable-set": {
      label: "[AEC] Enable AEC",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Channel",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "AEC",
          id: "value",
          choices: [
            { id: "false", label: "Off" },
            { id: "true", label: "On" },
          ],
        },
      ],
    },

    // AEC Set Non-linear Processing stregnth
    "aecnlp-set": {
      label: "[AEC] NLP Strength",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Channel",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "NLP Mode",
          id: "value",
          choices: [
            { id: "NLPMODE_NONE", label: "None" },
            { id: "NLPMODE_LOW", label: "Low" },
            { id: "NLPMODE_MEDIUM", label: "Medium" },
            { id: "NLPMODE_HIGH", label: "High" },
          ],
        },
      ],
    },

    // AEC Set Noise Reduction Stregnth
    "aecnr-set": {
      label: "[AEC] Noise Reduction Strength",
      options: [
        {
          type: "textinput",
          label: "Instance Tag",
          id: "instance",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "textinput",
          label: "Channel",
          id: "index1",
          regex: self.REGEX_NUMBER,
        },
        {
          type: "dropdown",
          label: "Strength",
          id: "AEC",
          choices: [
            { id: "OFF", label: "None" },
            { id: "LOW", label: "Low" },
            { id: "MED", label: "Medium" },
            { id: "HIGH", label: "High" },
          ],
        },
      ],
    },
  });
};

// These are the functions that define the first part of the final command
instance.prototype.action = function (action) {
  var self = this;
  var opt = action.options;

  switch (action.action) {
    case "recall":
      opt.action = "recallPreset";
      opt.attribute = "recallPreset";
      break;

    case "fader-step":
      opt.attribute = "level";
      break;

    case "fader-set":
      opt.action = "set";
      opt.attribute = "level";
      break;

    case "mutebutton-set":
      opt.action = "set";
      opt.attribute = "mute";
      break;

    case "fadermute-set":
      opt.action = "set";
      opt.attribute = "mute";
      break;

    case "router-set":
      opt.action = "set";
      opt.attribute = "input";
      break;

    case "source-set":
      opt.action = "set";
      opt.attribute = "sourceSelection";
      break;

    case "sourcevolume-set":
      opt.action = "set";
      opt.attribute = "sourceLevel";
      break;

    case "leveler-set":
      opt.action = "set";
      opt.attribute = "bypass";
      break;

    case "comp-set":
      opt.action = "set";
      opt.attribute = "bypass";
      break;

    case "noise-set":
      opt.action = "set";
      opt.attribute = "bypass";
      break;

    case "inputlevel-set":
      opt.action = "set";
      opt.attribute = "inputLevel";
      break;

    case "duckerlevelsense-set":
      opt.action = "set";
      opt.attribute = "senseLevel";
      break;

    case "duckersensemute-set":
      opt.action = "set";
      opt.attribute = "senseMute";
      break;

    case "inputmute-set":
      opt.action = "set";
      opt.attribute = "inputMute";
      break;
    // ---------------------------------------------------------
    // Stuff for a future revision
    // ---------------------------------------------------------

    case "xover2-set":
      opt.action = "set";
      opt.attribute = "XOVER2FC";
      break;

    case "xover3-set":
      opt.action = "set";
      opt.attribute = "XOVER3FC";
      break;

    case "xover4-set":
      opt.action = "set";
      opt.attribute = "XOVER4FC";
      break;

    case "hpfcutoff-set":
      opt.action = "set";
      opt.attribute = "HPFLTFC";
      break;

    case "hpfbypass-set":
      opt.action = "set";
      opt.attribute = "HPFLTBYP";
      break;

    case "lpfcutoff-set":
      opt.action = "set";
      opt.attribute = "LPFLTFC";
      break;

    case "lpfbypass-set":
      opt.action = "set";
      opt.attribute = "LPFLTBYP";
      break;

    case "highshelfcutoff-set":
      opt.action = "set";
      opt.attribute = "HSFLTFC";
      break;

    case "highshelfgain-set":
      opt.action = "set";
      opt.attribute = "HSFLTGAIN";
      break;

    case "highshelfbypass-set":
      opt.action = "set";
      opt.attribute = "HSFLTBYP";
      break;

    case "lowshelfcutoff-set":
      opt.action = "set";
      opt.attribute = "LSFLTFC";
      break;

    case "lowshelfgain-set":
      opt.action = "set";
      opt.attribute = "LSFLTGAIN";
      break;

    case "lowshelfbypass-set":
      opt.action = "set";
      opt.attribute = "LSFLTBYP";
      break;

    case "allpassbypass-set":
      opt.action = "set";
      opt.attribute = "APFLBYPALL";
      break;

    case "allpassbypassband-set":
      opt.action = "set";
      opt.attribute = "APFLTBYPBND";
      break;

    case "allpasscenter-set":
      opt.action = "set";
      opt.attribute = "APFLBYPBND";
      break;

    case "allpassbw-set":
      opt.action = "set";
      opt.attribute = "APFLTBWBND";
      break;

    case "geqlevel-set":
      opt.action = "set";
      opt.attribute = "GEQLVLBND";
      break;

    case "geqbypass-set":
      opt.action = "set";
      opt.attribute = "GEQBYPALL";
      break;

    case "peqbypass-set":
      opt.action = "set";
      opt.attribute = "PEQBYPALL";
      break;

    case "peqbypassband-set":
      opt.action = "set";
      opt.attribute = "PEQBYPBND";
      break;

    case "peqcenter-set":
      opt.action = "set";
      opt.attribute = "PEQFCBND";
      break;

    case "peqbw-set":
      opt.action = "set";
      opt.attribute = "PEQBWBND";
      break;

    case "peqlevel-set":
      opt.action = "set";
      opt.attribute = "PEQLVLBND";
      break;

    // ---------------------------------------------------------
    // And we're back to stuff for current revision
    // ---------------------------------------------------------

    case "gain-set":
      opt.action = "set";
      opt.attribute = "gain";
      break;

    case "level-set":
      opt.action = "set";
      opt.attribute = "level";
      break;

    case "phantom-set":
      opt.action = "set";
      opt.attribute = "phantomPower";
      break;

    case "polarity-set":
      opt.action = "set";
      opt.attribute = "invert";
      break;

    case "aecenable-set":
      opt.action = "set";
      opt.attribute = "aecEnable";
      break;

    case "aecnlp-set":
      opt.action = "set";
      opt.attribute = "nlpMode";
      break;

    case "aecnr-set":
      opt.action = "set";
      opt.attribute = "nlpMode";
      break;
  }

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
  //
  // ---------------------------------------------------------------------------------------------
  if (opt.action && opt.device && opt.attribute) {
    let cmd = `${opt.instance} ${opt.action} ${opt.attribute}`;
    if (opt.index1) {
      cmd = cmd + " " + opt.index1;
    }
    if (opt.index2) {
      cmd = cmd + " " + opt.index2;
    }
    if (opt.value) {
      cmd = cmd + " " + opt.value;
    }

    debug(`Sending "${cmd}" to ${self.config.host}`);

    if (self.socket !== undefined && self.socket.connected) {
      self.socket.send(cmd + "\n");
    } else {
      debug("Socket not connected :(");
    }
  }
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
