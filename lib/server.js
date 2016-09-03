'use strict';

var EventEmitter = require('events').EventEmitter;
var assert = require('assert');
var inherits = require('util').inherits;

var _ = require('lodash');
var async = require('async');
var bitcore = require('bitcore-node');

var Config = require('./config');
var WalletService = require('./wallet-service');
var utils = require('./utils');

function Server(options) {
  if (!(this instanceof Server)) {
    return new Server(options);
  }
  assert(options, 'first argument is expected to be an object');
  assert(options.network, '"network" option is expected');
  this.network = options.network;
  this.node = null;
  this.configPath = options.configPath;
  this.config = null;
}
inherits(Server, EventEmitter);

Server.prototype._loadConfig = function(callback) {
  var self = this;
  this.config = new Config({
    network: this.network,
    path: this.configPath
  });
  async.series([
    function(next) {
      utils.setupDirectory(self.config.path, next);
    },
    function(next) {
      self.config.setupConfig(next);
    }
  ], function(err) {
    if (err) {
      return callback(err);
    }
    callback();
  });
};

Server.prototype._startNode = function(callback) {

  var walletConfig = _.clone(this.config.data.wallet);
  walletConfig.configPath = this.configPath;

  this.node = new bitcore.Node({
    network: this.network,
    services: [
      {
        name: 'bitcoind',
        module: bitcore.services.Bitcoin,
        config: this.config.data.bitcoind
      },
      {
        name: 'wallet',
        module: WalletService,
        config: walletConfig
      }
    ]
  });

  this.node.start(callback);
};

Server.prototype.start = function(callback) {
  var self = this;
  self._loadConfig(function(err) {
    if (err) {
      return callback(err);
    }
    self._startNode(callback);
  });
};

Server.prototype.stop = function(callback) {
  this.node.stop(callback);
};

module.exports = Server;
