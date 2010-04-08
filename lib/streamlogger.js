
var
  sys    = require('sys'),
  fs     = require('fs')
  events = require('events');

exports.levels = {debug: 0, info:1, warn:2, fatal:3};
exports.revLevels  = {}
for (var lName in exports.levels) {
  var lVal = exports.levels[lName];
  exports.revLevels[lVal]= lName; 
}

var StreamLogger = exports.StreamLogger = function() {
  this.filePaths = new Array();
  for (var i = arguments.length; i != 0; i--)
    this.filePaths.push(arguments[i - 1]);
  this.fstreams   = [];

  var level = this.level  = exports.levels.info;
  //Build a reverse mapping of level values to keys, for fast lookup later
  //Events support
  this.emitter = new events.EventEmitter();

  //Setup a method for each log level
  for (var logLevel in exports.levels) {
    this[logLevel] = (function(logLevel) {
      return function (message,callback) {
        this.logAtLevel(message, exports.levels[logLevel], callback);
      }
    })(logLevel);
  }

  this.open();
};

//Create write streams for all the files, emit 'streamsOpen', if/when
//all streams open. Will fire callback after as well
StreamLogger.prototype.open = function(callback) {
  var emitter = this.emitter;
  for (var i = this.filePaths.length; i != 0; i--) {
    var filePath = this.filePaths[i - 1];
    var unopenedFilePathCount = this.filePaths.length;
    var stream = fs.createWriteStream(filePath, 
        {flags: 'a', mode: 0644, encoding: 'utf8'}
      )
      .addListener('open', function(fd) {
        unopenedFilePathCount--;
        if (unopenedFilePathCount == 0) {
          emitter.emit("open");
          if (callback)
            callback();
        }
      })
      .addListener('error', function(err) {
        emitter.emit(err,filePath)
      });
    this.fstreams.push(stream);
  }
};

//Close all write streams, fire the callback after all streams are closed
//Also emits 'close' after all streams are closed
StreamLogger.prototype.close = function(callback) {
  var openStreamsCount = this.fstreams.length,
      emitter  = this.emitter,
      slSelf = this;
      this.emittedClose = false; //Ensures we only emit 'close' once
  for (var i = openStreamsCount; i !=0; i--) {
    this.fstreams[i - 1].close(function () {
      openStreamsCount--;
      if (openStreamsCount == 0 && ! this.emittedClose) {
        //We're done closing, so emit the callbacks, then remove the fstreams
        slSelf.fstreams = [];
         
        emitter.emit("close");
        if (callback)
          callback();
      }
    });
  }
};

StreamLogger.prototype.reopen = function(callback) {
  var slSelf = this;
  this.close(function() {
    slSelf.open(function() {
      if (callback)
        callback();
    });
  }); 
};

StreamLogger.prototype.logAtLevel = function(message,level,callback) {
  var levelName = exports.revLevels[level];
  this.emitter.emit('message', message, levelName)
   
  if (level < this.level)
    return false 
   
  this.emitter.emit('loggedMessage', message, levelName)
  
  var outMessage = (new Date).toUTCString() + ' - ' +
                     levelName + ': ' + message; 
  
  for (var i = this.fstreams.length; i != 0; i--) {
    var fstream = this.fstreams[i - 1];
    //Ideally we could trap the errors #write creates, I'm not sure
    //if thats possible though
    if (fstream.writeable) {
      fstream.write(outMessage + "\n");
      if (callback)
        callback();
    }
    else
      this.emitter.emit('error',"Stream not writable", fstream.path);
  }
};