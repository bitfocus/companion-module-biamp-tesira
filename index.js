// BiAmp Tesira

var tcp = require("../../tcp");
var TelnetSocket = require('../../telnet');
const { slice } = require("lodash");

const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariableDefinitions = require('./variables')

class ModuleInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

  async init(config) {
		this.config = config
    this.TIMER_FADER = null;
    this.customVarNames = [];
    this.customVars = [];

		this.updateStatus(InstanceStatus.Ok)

    this.initPresets();
    this.init_tcp();

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
	}

	// When module gets deleted
	async destroy() {
    if (this.socket !== undefined) {
      this.socket.destroy();
    }
  
    //destroy timers
    if (this.TIMER_FADER !== null) {
      clearInterval(this.TIMER_FADER);
      this.TIMER_FADER = null;
    }
  
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.config = config
	}


  //based on code from the extron smx module -- 
  //process data received from the telnet connection
  incomingData = function(data) {
    debug(data);

    // Match part of the response from unit when a connection is made.
    if (this.login === false && data.match(/Welcome to the Tesira Text Protocol Server/)) {
      this.status(this.STATUS_OK);
      debug("Logged in");
    }

    //capture subscription responses into custom variables (example:! "publishToken":"MyLevelCustomLabel" "value":-100.0000)
    //regEx to capture label and value:  /! \"publishToken\":\"(\w*)\" \"value\":(.*)/gm

    if (data.match(/! \"publishToken\":\"\w*\" \"value\":.*/)) {
      match = data.match(/! \"publishToken\":\"(\w*)\" \"value\":(.*)/);
      
      //remove all the useless trailing zeros from number values
      varName = match[1];
      value = match[2];
      if (value.indexOf('.') > 0) {
        value = value.slice(0,value.indexOf('.'));
      }

      if(!(varName in this.customVarNames)) {
        customVarNames[varName] = "";
        customVars.push({name: varName, variableId: varName});
        this.setVariableDefinitions(customVars);
      }

      tmpVar = {};
      tmpVar[varName] = value;
      this.setVariableValues(tmpVar);

      console.log("variable set - "+ varName + " = " + value);
    }
  };

  init_tcp = function () {
    if (this.socket !== undefined) {
      this.socket.destroy();
      delete this.socket;
    }

    this.config.port = 23;

    if (this.config.host && this.config.port) {
      this.socket = new TelnetSocket(this.config.host, this.config.port);

      this.socket.on("status_change", function (status, message) {
        this.status(status, message);
      });

      this.socket.on("error", function (err) {
        debug("Network error", err);
        this.log("error", "Network error: " + err.message);
      });

      this.socket.on("connect", function () {
        debug("Socket Connected");
      });
    } else {
      this.log("error", "Please specify host in config.");
    }

    //capture incoming data
    this.socket.on("data", function(buffer) {
      var indata = buffer.toString("utf8");
      this.incomingData(indata);
    });

    //respond to telnet option negotiation, decline everything
    this.socket.on("iac", function(type, info) {
      // tell remote we WONT do anything we're asked to DO
      if (type == 'DO') {
        this.socket.write(Buffer.from([ 255, 252, info ]));
      }

      // tell the remote DONT do whatever they WILL offer
      if (type == 'WILL') {
        this.socket.write(Buffer.from([ 255, 254, info ]));
      }
    });
  };

  //instance.prototype.addVariable = function (testvar) { // this causes a crash!
  //  var self = this;
  //  test = self.getVariable(testvar);
  //  console.log("checking new variable -->" + test);
  //TO DO:  find a way to manage the custom variables that we're setting up based on return values from tesira.  add definitions so that they show up to the user


  initPresets = function() {
    const presets = {};

    presets['inc_fader_level'] = {
      type: 'button',
      category: "Fader Level",
      name: "Inc Fader",
      style: {
        text: "Fader +",
        size: "14",
        color: "16777215",
        bgcolor: combineRgb(0, 0, 0)
      },
      steps: [
        {
          down: [
            {
              actionId: "incFaderLevelTimer",
              options: {
                rate: "200",
                command: "increment",
                instanceID: "Level1",
                amount: 1
              }
            }
          ],
          up: [
            {
              actionId: "incFaderLevelStop"
            }
          ]
        }
      ],
      feedbacks: []
    };

    presets['dec_fader_level'] = {
      type: 'button',
      category: "Fader Level",
      name: "Dec Fader",
      style: {
        text: "Fader -",
        size: "14",
        color: "16777215",
        bgcolor: combineRgb(0, 0, 0)
      },
      steps: [
        {
          down: [
            {
              actionId: "incFaderLevelTimer",
              options: {
                rate: "200",
                command: "decrement",
                instanceID: "Level1",
                amount: 1
              }
            }
          ],
          up: [
            {
              actionId: 'incFaderLevelStop'
            }
          ]
        }
      ],
      feedbacks: []
    };

    presets['mute'] = {
      type: 'button',
      category: "Mute",
      name: "Mute",
      style: {
        text: "Mute",
        size: "14",
        color: "16777215",
        bgcolor: combineRgb(0, 0, 0)
      },
      steps: [
        {
          down: [
            {
              actionId: "faderMute",
              options: {
                instanceID: "Mute1",
                channel: 1,
                status: "Mute",
              }
            }
          ],
          up: [
            {
              actionId: "faderMute",
              options: {
                instanceID: "Mute1",
                channel: 1,
                status: "Unmute",
              }
            }
          ]
        }
      ],
      feedbacks: []
    };

    presets['fader_level'] = {
      type: 'button',
      category: "Fader Level",
      name: "Set Fader To Level",
      style: {
        text: "Fader1 Set To 0db",
        size: "14",
        color: "16777215",
        bgcolor: combineRgb(0, 0, 0)
      },
      steps: [
        {
          down: [
            {
              actionId: "setFaderLevel",
              options: {
                instanceID: "Level1",
                channel: 1,
                level: 0,
              }
            }
          ],
          up: [
            {
              actionId: 'incFaderLevelStop'
            }
          ]
        }
      ],
      feedbacks: []
    };

    this.setPresetDefinitions(presets);
  };

  sendCommand = function(cmd) {
    if (cmd !== undefined) {
      if (this.socket !== undefined && this.socket.connected) {
        this.socket.send(cmd + "\r\n");
        debug("Sent Command: " + cmd);
      } else {
        debug("Socket not connected :(");
      }
    } else {
      this.log("error", "Invalid command: " + cmd);
    }
  };

  Fader_Change = function (command, deviceID, instanceID, channel, amount) {
    cmd = instanceID + " " + command + " " + "level" + " " + channel + " " + amount;
    this.sendCommand(cmd);
  };

  Fader_Timer = function (mode, rate, command, deviceID, instanceID, channel, amount) {
    if (this.TIMER_FADER !== null) {
      clearInterval(this.TIMER_FADER);
      this.TIMER_FADER = null;
    }

    if (mode === "start") {
      this.TIMER_FADER = setInterval(
        this.Fader_Change.bind(this),
        parseInt(rate),
        command,
        deviceID,
        instanceID,
        channel,
        amount
      );
    }
  };

  getConfigFields() {
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
        regex: REGEX_IP,
      },
    ];
  };

  updateActions() {
    UpdateActions(this)
  }

  updateFeedbacks() {
    UpdateFeedbacks(this)
  }

  updateVariableDefinitions() {
    UpdateVariableDefinitions(this)
  }
}

runEntrypoint(ModuleInstance, UpgradeScripts);


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
