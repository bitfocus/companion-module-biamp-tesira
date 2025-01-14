const { InstanceBase, Regex, TelnetHelper, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')

class TesiraInstance extends InstanceBase {
	constructor(internal) {
		super(internal);
	}

  async init(config) {
		this.config = config;
    this.TIMER_FADER = null;
    this.customVarNames = [];
    this.customVars = [];

    this.log("debug", "Init");

		this.updateStatus(InstanceStatus.Connecting);

    this.initPresets();
    this.initTCP();

		this.updateActions(); // export actions
		this.updateFeedbacks(); // export feedbacks
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
  
		this.log("debug", "Destroy");
	}

	async configUpdated(config) {
		this.config = config;
	}


	initTCP() {
		const maxBufferLength = 2048 
		let receivebuffer = []

    if (this.socket !== undefined) {
			this.socket.destroy();
			delete this.socket;
		}

		if (this.config.host) {
      this.log("debug", "Connection to " + this.config.host + " port 23");
			this.socket = new TelnetHelper(this.config.host, 23);

      this.socket.on("status_change", (status, message) => {
        this.log("debug", status + " -- " + message);
      });

      this.socket.on("error", (err) => {
        this.log("error", "Network error: " + err.message);
      });

      this.socket.on("connect", () => {
        this.log("debug", "Socket Connected");
      });

      this.socket.on("data", (buffer) => {
        const line = buffer.toString("utf-8");

        this.log("debug", "Data: " + line);

        // Match part of the response from unit when a connection is made.
        if (line.match(/Welcome to the Tesira Text Protocol Server/)) {
          this.updateStatus(InstanceStatus.Ok);
        }
    
        //capture subscription responses into custom variables (example:! "publishToken":"MyLevelCustomLabel" "value":-100.0000)
        //regEx to capture label and value:  /! \"publishToken\":\"(\w*)\" \"value\":(.*)/gm
        if (line.match(/! \"publishToken\":\"\w*\" \"value\":.*/)) {
          var tokens = line.match(/! \"publishToken\":\"(\w*)\" \"value\":(.*)/);
          
          //remove all the useless trailing zeros from number values
          var varName = tokens[1];
          var value = tokens[2];

          var tmpVar = {};
          //handle the possiblity of an array return value
          //Append "_" + index to the variable name for each element
          var tokenValueMatches = value.match(/\[(.*?)\]/);
          if(tokenValueMatches != null) {
            tokenValueMatches[1].split(" ").forEach(function(tokenValue, index) {
              var tmpVarName = varName + "_" + (index+1);
              if(!(tmpVarName in this.customVarNames)) {
                this.customVarNames[tmpVarName] = "";
                this.customVars.push({name: tmpVarName, variableId: tmpVarName});
                this.setVariableDefinitions(this.customVars);
              }

              if (tokenValue.indexOf('.') > 0) {
                tokenValue = tokenValue.slice(0,tokenValue.indexOf('.'));
              }

              tmpVar[tmpVarName] = tokenValue.trim();
              this.log("debug", "Variable set - "+ tmpVarName + " = " + tokenValue);
            }, this);
          } else {    
            if(!(varName in this.customVarNames)) {
              this.customVarNames[varName] = "";
              this.customVars.push({name: varName, variableId: varName});
              this.setVariableDefinitions(this.customVars);
            }
      
            if (value.indexOf('.') > 0) {
              value = value.slice(0,value.indexOf('.'));
            }
            tmpVar[varName] = value;
            this.log("debug", "Variable set - "+ varName + " = " + value);
          }

          this.setVariableValues(tmpVar);
        }
      });

      this.socket.on("iac", (type, info) => {
        this.log("debug", "Telnet- IAC");
        // tell remote we WONT do anything we're asked to DO
        if (type == 'DO') {
          this.socket.send(Buffer.from([ 255, 252, info ]));
        }
  
        // tell the remote DONT do whatever they WILL offer
        if (type == 'WILL') {
          this.socket.send(Buffer.from([ 255, 254, info ]));
        }
      });  
    } else {
      this.log("info", "Please specify host in config.");
    }
	}

  sendCommand(cmd) {
    if (cmd !== undefined) {
      if (this.socket !== undefined && this.socket.isConnected) {
        this.socket.send(cmd + "\r\n");
        this.log("debug", "Sent Command: " + cmd);
      } else {
        this.log("error", "Socket not connected :(");
      }
    } else {
      this.log("error", "Invalid command: " + cmd);
    }
  }

  //instance.prototype.addVariable = function (testvar) { // this causes a crash!
  //  var self = this;
  //  test = self.getVariable(testvar);
  //  console.log("checking new variable -->" + test);
  //TO DO:  find a way to manage the custom variables that we're setting up based on return values from tesira.  add definitions so that they show up to the user

  initPresets() {
    const presets = {};

    presets['inc_fader_level'] = {
      type: 'button',
      category: "Fader Level",
      name: "Inc Fader",
      style: {
        text: "Fader +",
        size: "14",
        color: "16777215",
        bgcolor: "rgb(0, 0, 0)"
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
        bgcolor: "rgb(0, 0, 0)"
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
        bgcolor: "rgb(0, 0, 0)"
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
        bgcolor: "rgb(0, 0, 0)"
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
  }

  Fader_Change(command, deviceID, instanceID, channel, amount) {
    cmd = instanceID + " " + command + " " + "level" + " " + channel + " " + amount;
    this.sendCommand(cmd);
  }

  Fader_Timer(mode, rate, command, deviceID, instanceID, channel, amount) {
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
  }

  getConfigFields() {
    return [
      {
        type: "static-text",
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
        regex: Regex.IP,
      }
    ];
  }

  updateActions() {
    UpdateActions(this);
  }

  updateFeedbacks() {
    UpdateFeedbacks(this);
  }
}

runEntrypoint(TesiraInstance, UpgradeScripts);


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
