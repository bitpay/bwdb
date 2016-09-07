'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var _ = require('lodash');
var async = require('async');
var bitcore = require('bitcore-lib');

var utils = require('../utils');

function ClientConfig(options) {
  if (!(this instanceof ClientConfig)) {
    return new ClientConfig(options);
  }
  if (!options) {
    options = {};
  }
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

ClientConfig.prototype.writeApiKey = function(cipherText, publicKey, salt, callback) {
  this.data.apiKey = {cipherText: cipherText, publicKey: publicKey, salt: salt};
  var configFile = this.getConfigFilePath();
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

ClientConfig.prototype.unlockApiKey = function(callback) {
  var self = this;
  if((this._apiKeyPrivate && this._apiKeyPublic) || !this.data.apiKey) {
    return callback();
  }
  async.retry(3, function(next) {
    utils.getPassphrase(function(err, passphrase) {
      utils.decryptSecret({
        cipherText: self.data.apiKey.cipherText,
        salt: self.data.apiKey.salt,
        passphrase: passphrase
      }, function(err, secret) {
        if (err) {
          console.log('Could not decrypt.');
          return next(err);
        }
        var privateKey = bitcore.PrivateKey.fromObject({
          bn: secret,
          compressed: true,
          network: self.network
        });
        self._apiKeyPublic = privateKey.toPublicKey().toBuffer();
        self._apiKeyPrivate = privateKey.toBuffer();
        next();
      });
    });
  }, callback);
};

ClientConfig.prototype.lockApiKey = function() {
  delete this._apiKeyPrivate;
  delete this._apiKeyPublic;
};

ClientConfig.prototype.getApiPublicKey = function() {
  if (!this._apiKeyPublic) {
    throw new Error('Api Key is locked.');
  }
  return this._apiKeyPublic;
};

ClientConfig.prototype.getApiPrivateKey = function() {
  if (!this._apiKeyPrivate) {
    throw new Error('Api Key is locked.');
  }
  return this._apiKeyPrivate;
};

ClientConfig.prototype.hasApiKey = function() {
  return !!this.data.apiKey;
};

ClientConfig.prototype.writeKnownHost = function(fingerprint, certificate, callback) {
  assert(Buffer.isBuffer(certificate));
  assert(_.isString(fingerprint));
  if (!this.data.knownHosts) {
    this.data.knownHosts = {};
  }

  this.data.knownHosts[fingerprint] = certificate.toString('base64');

  var configFile = this.getConfigFilePath();
  fs.writeFile(configFile, JSON.stringify(this.data, false, 2), callback);
};

ClientConfig.prototype.getKnownHostCertificates = function() {
  var certs = [];
  for (var key in this.data.knownHosts) {
    var cert = this.data.knownHosts[key];
    var pem = '-----BEGIN CERTIFICATE-----\n' + cert + '\n' + '-----END CERTIFICATE-----\n';
    certs.push(new Buffer(pem));
  }
  return certs;
};

ClientConfig.prototype.hasKnownHostFingerprint = function(fingerprint) {
  if (!this.data.knownHosts) {
    return false;
  }
  return !!this.data.knownHosts[fingerprint];
};

ClientConfig.prototype.hasKnownHosts = function() {
  return !!this.data.knownHosts;
};

module.exports = ClientConfig;

