'use strict';

var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

var request = require('request');
var io = require('socket.io-client');

function Client(options) {
  assert(options.network, '"network" is an expected option');
  assert(options.url, '"url" is an expected option');
  assert(/\/$/.test(options.url) === false, '"url" trailing slash is not expected');
  this.network = options.network;
  this.url = options.url;
  this.socket = null;
  this.lastTipHeight = null;
  this.lastTipHash = null;
}
inherits(Client, EventEmitter);

Client.prototype._connectWebSocket = function(callback) {
  var self = this;
  var socketURL;
  if (/^https/.test(this.url)) {
    socketURL = this.url.replace('https:', 'wws:');
  } else {
    socketURL = this.url.replace('http:', 'ws:');
  }
  this.socket = io.connect(socketURL, {
    reconnection: true,
    transports: ['websocket']
  });

  this.socket.on('error', function(err) {
    self.emit('error', err);
  });

  var returned = false;
  this.socket.once('connection', function(){
    if (!returned) {
      returned = true;
      callback();
    }
  });
  this.socket.once('connect_error', function(err) {
    if (!returned) {
      returned = true;
      callback(err);
    }
  });
};

Client.prototype._maybeCallback = function(callback, err) {
  if (callback) {
    return callback(err);
  }
  if (err) {
    this.emit('error', err);
  }
};

/**
 * Will start the client and emit a "start" event
 * @param {Function=} callback - Optional callback
 */
Client.prototype.connect = function(callback) {
  var self = this;
  self._connectWebSocket(function(err) {
    if (err) {
      return self._maybeCallback(callback, err);
    }
    self.emit('connected');
    self._maybeCallback(callback);
  });
};

Client.prototype.disconnect = function(callback) {
  setImmediate(callback);
};

Client.prototype._request = function(method, endpoint, callback) {
  var self = this;

  request({
    method: method,
    uri: this.url + endpoint,
    json: true
  }, function(err, res, body) {
    if (err) {
      return callback(err);
    }

    assert(self.network === res.headers['x-bitcoin-network'], 'Network mismatch');
    self.lastTipHeight = res.headers['x-bitcoin-height'];
    self.lastTipHash = res.headers['x-bitcoin-hash'];

    callback(err, body);

  });
};

Client.prototype._put = function(endpoint, callback) {
  this._request('PUT', endpoint, callback);
};

Client.prototype._get = function(endpoint, callback) {
  this._request('GET', endpoint, callback);
};

Client.prototype.importKey = function(address, callback) {
  this._put('/addresses/' + address, function(err, res, body) {
    callback(err, res, body);
  });
};

Client.prototype.getTransactions = function(callback) {
  this._get('/transactions', function(err, res, body) {
    callback(err, res, body);
  });
};

Client.prototype.getTxids = function(callback) {
  this._get('/txids', function(err, res, body) {
    callback(err, res, body);
  });
};

module.exports = Client;
