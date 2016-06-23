'use strict';

var async = require('async');
var Config = require('./config');

function Client(options) {
  this.network = options.network;
  this.config = null;
}

Client.prototype._initConfig = function(options, callback) {
  this.config = options.config;
  setImmediate(callback);
};

Client.prototype.importKey = function() {
};

Client.prototype.getTransactions = function() {
};

Client.prototype.getTxids = function() {
};

module.exports = Client;
