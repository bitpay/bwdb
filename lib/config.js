'use strict';

var fs = require('fs');
var assert = require('assert');
var path = require('path');
var bitcore = require('bitcore-lib');

function Config(options) {
  this.network = bitcore.Networks.get(options.network);
  assert(this.network, '"network" is an expected option, please specify "livenet", "testnet" or "regtest"');
  this.path = options.path || path.resolve(process.env.HOME, './.bwsv2');
}

Config.prototype.getApplicationPath = function() {
  return this.path;
};

Config.prototype.getDatabasePath = function() {
  var databasePath;
  if (this.network === bitcore.Networks.livenet) {
    databasePath = path.resolve(this.path, './livenet.lmdb');
  } else if (this.network === bitcore.Networks.testnet) {
    if (this.network.regtestEnabled) {
      databasePath = path.resolve(this.path, './regtest.lmdb');
    } else {
      databasePath = path.resolve(this.path, './testnet3.lmdb');
    }
  } else {
    throw new TypeError('Unknown network: ' + this.network);
  }
  return databasePath;
};

Config.prototype.getConfigFilePath = function() {
  return path.resolve(this.path, './config.json');
};

Config.prototype.writeDefaultConfig = function(callback) {
  var configFile = this.getConfigFilePath();
  this.data = {
    bitcoind: {
      spawn: {
        datadir: path.resolve(this.path, './bitcoin'),
        exec: path.resolve(__dirname, '../node_modules/.bin/bitcoind')
      }
    },
    web: {
      port: 3002,
      enableSocketRPC: false
    },
    wallet: {}
  };
  fs.writeFile(configFile, JSON.stringify(this.data, false, 2), callback);
};

Config.prototype.setupConfig = function(callback) {
  var self = this;
  var configFile = this.getConfigFilePath();
  fs.readFile(configFile, 'utf8', function(err, data) {
    if (err && err.code === 'ENOENT') {
      return self.writeDefaultConfig(callback);
    } else if (err) {
      return callback(err);
    }

    try {
      self.data = JSON.parse(data);
    } catch(err) {
      return callback(err);
    }

    callback();

  });
};

module.exports = Config;
