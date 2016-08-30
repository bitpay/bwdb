'use strict';

var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

var request = require('request');
var _ = require('lodash');
var async = require('async');

var TransactionsStream = require('./streams/transactions');
var TxidsStream = require('./streams/txids');
var ListStream = require('./streams/list');
var CSVStream = require('./streams/csv');
var version = require('../../package.json').version;
var utils = require('../utils');
var db = require('./db');
var Config = require('./config');

function Client(options) {
  if (!(this instanceof Client)) {
    return new Client(options);
  }
  if (!options) {
    options = {};
  }
  this.config = new Config({
    network: options.network,
    path: options.configPath,
    url: options.url
  });
  this.bitcoinHeight = null;
  this.bitcoinHash = null;
  this.socket = null;
  this.db = null;
}
inherits(Client, EventEmitter);

Client.prototype.connect = function(callback) {
  var self = this;
  async.series([
    function(next) {
      utils.setupDirectory(self.config.path, next);
    },
    function(next) {
      self.config.setupConfig(next);
    },
    function(next) {
      var dbPath = self.config.getDatabasePath();
      utils.setupDirectory(dbPath, function(err) {
        if (err) {
          return next(err);
        }
        self.db = db.open(dbPath);
        next();
      });
    }
  ], function(err) {
    if (err) {
      return callback(err);
    }
    callback();
  });
};

Client.prototype.disconnect = function() {
  if (this.db) {
    db.close(this.db);
  }
}

Client.prototype._maybeCallback = function(callback, err) {
  if (callback) {
    return callback(err);
  }
  if (err) {
    this.emit('error', err);
  }
};

Client.prototype._request = function(method, endpoint, params, callback) {
  var self = this;

  var options = {
    method: method,
    uri: self.config.url + endpoint,
    json: true,
    headers: {
      'user-agent': 'bwdb-' + version,
    }
  };

  if (params && method.toUpperCase() === 'GET') {
    options.qs = params;
  } else if (params) {
    options.headers['content-type'] = 'application/json';
    options.body = params;
  }

  request(options, function(err, res, body) {
    if (err) {
      return callback(err);
    }

    if (res.statusCode === 404) {
      err = new Error('404 Not Found');
      err.statusCode = 404;
      return callback(err);
    }

    if (res.statusCode === 400) {
      err = new Error('400 Bad Request: ' + body);
      err.statusCode = 400;
      return callback(err);
    }

    if (res.statusCode >= 500) {
      err = new Error(res.statusCode + ' Server Error: ' + body);
      err.statusCode = res.statusCode;
      return callback(err);
    }

    var serverNetwork = res.headers['x-bitcoin-network'];
    if (self.config.getNetworkName() !== serverNetwork) {
      err = new Error('Network mismatch, server network is: ' + serverNetwork);
      return callback(err);
    }

    self.bitcoinHeight = parseInt(res.headers['x-bitcoin-height']);
    self.bitcoinHash = res.headers['x-bitcoin-hash'];

    callback(err, res, body);

  });
};

Client.prototype._put = function(endpoint, callback) {
  this._request('PUT', endpoint, false, callback);
};

Client.prototype._get = function(endpoint, params, callback) {
  this._request('GET', endpoint, params, callback);
};

Client.prototype._post = function(endpoint, body, callback) {
  this._request('POST', endpoint, body, callback);
};

Client.prototype.createWallet = function(walletId, callback) {
  this._put('/wallets/' + walletId, callback);
};

Client.prototype.importAddress = function(walletId, address, callback) {
  this._put('/wallets/' + walletId + '/addresses/' + address, callback);
};

Client.prototype.importAddresses = function(walletId, addresses, callback) {
  this._post('/wallets/' + walletId + '/addresses', {addresses: addresses}, callback);
};

Client.prototype.getTransactions = function(walletId, options, callback) {
  this._get('/wallets/' + walletId + '/transactions', options, callback);
};

Client.prototype.getUTXOs = function(walletId, options, callback) {
  this._get('/wallets/' + walletId + '/utxos', options, callback);
};

Client.prototype.getTxids = function(walletId, options, callback) {
  this._get('/wallets/' + walletId + '/txids', options, callback);
};

Client.prototype.getBalance = function(walletId, callback) {
  this._get('/wallets/' + walletId + '/balance', {}, callback);
};

Client.prototype.getInfo = function(callback) {
  this._get('/info', {}, callback);
};

Client.TransactionsStream = TransactionsStream;
Client.prototype.getTransactionsStream = function(walletId, options) {
  options.client = this;
  var stream = new TransactionsStream(walletId, options);
  return stream;
};

Client.TxidsStream = TxidsStream;
Client.prototype.getTxidsStream = function(walletId, options) {
  options.client = this;
  var stream = new TxidsStream(walletId, options);
  return stream;
};

Client.CSVStream = CSVStream;
Client.prototype.getTransactionsCSVStream = function(walletId, options) {
  options.client = this;
  var stream = new CSVStream(walletId, options);
  return stream;
};

Client.ListStream = ListStream;
Client.prototype.getTransactionsListStream = function(walletId, options) {
  options.client = this;
  var stream = new ListStream(walletId, options);
  return stream;
};

module.exports = Client;
