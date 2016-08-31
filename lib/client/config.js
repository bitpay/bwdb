'use strict';

var fs = require('fs');
var assert = require('assert');
var path = require('path');

var bitcore = require('bitcore-lib');

function ClientConfig(options) {
  if (options.network === 'regtest') {
    bitcore.Networks.enableRegtest();
  }
  this._network = bitcore.Networks.get(options.network);
  this._url = options.url;
  this.path = options.path || path.resolve(process.env.HOME, './.bwdb');
  this.network = null;
  this.url = null;
  this.data = null;
  this.dirname = __dirname;
}

ClientConfig.prototype.getNetworkName = function() {
  var network = this.network.name;
  if (this.network.regtestEnabled) {
    network = 'regtest';
  }
  return network;
};

ClientConfig.prototype.getDatabasePath = function() {
  var databasePath;
  if (this.network === bitcore.Networks.livenet) {
    databasePath = path.resolve(this.path, './livenet-client.lmdb');
  } else if (this.network === bitcore.Networks.testnet) {
    if (this.network.regtestEnabled) {
      databasePath = path.resolve(this.path, './regtest-client.lmdb');
    } else {
      databasePath = path.resolve(this.path, './testnet3-client.lmdb');
    }
  } else {
    throw new TypeError('Unknown network: ' + this.network);
  }
  return databasePath;
};

ClientConfig.prototype.getConfigFilePath = function() {
  return path.resolve(this.path, './client.json');
};

ClientConfig.prototype.writeDefaultConfig = function(callback) {
  var configFile = this.getConfigFilePath();
  this.data = {
    url: 'http://localhost:3002',
    network: 'livenet'
  };
  this.defineProperties();
  fs.writeFile(configFile, JSON.stringify(this.data, false, 2), callback);
};

ClientConfig.prototype.setupConfig = function(callback) {
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
    self.defineProperties();
    callback();

  });
};

ClientConfig.prototype.defineProperties = function() {
  Object.defineProperty(this, 'network', {
    get: function() {
      var network = bitcore.Networks.get(this._network || this.data.network);
      assert(network, 'network must not be null');
      return network;
    }
  });
  Object.defineProperty(this, 'url', {
    get: function() {
      return this._url || this.data.url;
    }
  });
};

module.exports = ClientConfig;

