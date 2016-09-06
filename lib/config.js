'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var bitcore = require('bitcore-lib');

var utils = require('./utils');

function Config(options) {
  if (options.network === 'regtest') {
    bitcore.Networks.enableRegtest();
  }
  this.network = bitcore.Networks.get(options.network);
  assert(this.network, '"network" is an expected option, please specify "livenet", "testnet" or "regtest"');
  this.path = options.path || path.resolve(process.env.HOME, './.bwdb');
  this.data = options.data || null;
  this.dirname = __dirname;
}

Config.prototype.getWriterSocketPath = function(pid) {
  assert(pid, '"pid" is expected');
  return path.resolve(this.getApplicationPath(), './writer-' + pid + '.sock');
};

Config.prototype.getNetworkName = function() {
  var network = this.network.name;
  if (this.network.regtestEnabled) {
    network = 'regtest';
  }
  return network;
};

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
  return path.resolve(this.path, './server.json');
};

Config.prototype.writeDefaultConfig = function(callback) {
  var configFile = this.getConfigFilePath();
  this.data = {
    bitcoind: {
      spawn: {
        datadir: path.resolve(this.path, './bitcoin'),
        exec: path.resolve(this.dirname, '../node_modules/.bin/bitcoind')
      }
    },
    wallet: {
      port: 3002
    }
  };
  fs.writeFile(configFile, JSON.stringify(this.data, false, 2), callback);
};

Config.prototype.loadConfig = function(callback) {
  var self = this;
  var configFile = this.getConfigFilePath();
  fs.readFile(configFile, 'utf8', function(err, data) {
    if (err) {
      return callback(err);
    }
    self.setConfig(data, callback);
  });
};

Config.prototype.setConfig = function(data, callback) {
  try {
    this.data = JSON.parse(data);
  } catch(err) {
    return callback(err);
  }

  // expand relative paths
  if (this.data.bitcoind.spawn) {
    assert(this.data.bitcoind.spawn.datadir, '"datadir" is expected');
    assert(this.data.bitcoind.spawn.exec, '"exec" is expected');
    this.data.bitcoind.spawn.datadir = path.resolve(this.path, this.data.bitcoind.spawn.datadir);
    this.data.bitcoind.spawn.exec = path.resolve(this.path, this.data.bitcoind.spawn.exec);
  }
  callback();
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
    self.setConfig(data, callback);
  });
};

Config.prototype.isAuthorized = function(identity) {
  var self = this;
  if (!self.data) {
    throw new Error('Configuration not yet loaded');
  }
  if (!self.data.wallet || !self.data.wallet.authorizedKeys || !self.data.wallet.authorizedKeys.length) {
    return true;
  }
  for (var i = 0; i < self.data.wallet.authorizedKeys.length; i++) {
    if (identity === self.data.wallet.authorizedKeys[i]) {
      return true;
    }
  }
  return false;
};

Config.prototype.getURL = function(callback) {
  var self = this;
  var configFile = self.getConfigFilePath();
  fs.exists(configFile, function(exists) {
    if (exists) {
      fs.readFile(configFile, 'utf8', function(err, data) {
        if (err) {
          return callback(err);
        }
        var config = JSON.parse(data);
        var url = (config.wallet.https ? 'https' : 'http') + '://localhost:' + config.wallet.port;
        callback(null, url);
      });
    } else {
      utils.setupDirectory(configFile + '/../', function() {
        self.writeDefaultConfig(function(err) {
          if (err) {
            return callback(err);
          }
          self.getURL(callback);
        });
      });
    }
  });
};

module.exports = Config;
