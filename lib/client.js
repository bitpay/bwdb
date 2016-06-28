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

Client.prototype._request = function(method, endpoint, body, callback) {
  var self = this;

  var options = {
    method: method,
    uri: this.url + endpoint,
    json: true,
    headers: {
      'user-agent': 'bwsv2',
    }
  };

  if (body) {
    options.headers['content-type'] = 'application/json';
    options.body = body;
  }

  request(options, function(err, res, body) {
    if (err) {
      return callback(err);
    }

    if (res.statusCode === 404) {
      return callback(new Error('404 Not Found'));
    }

    if (res.statusCode === 400) {
      return callback(new Error('400 Bad Request: ' + body));
    }

    var serverNetwork = res.headers['x-bitcoin-network'];
    assert(self.network === serverNetwork, 'Network mismatch, server network is: ' + serverNetwork);
    callback(err, body);

  });
};

Client.prototype._put = function(endpoint, callback) {
  this._request('PUT', endpoint, false, callback);
};

Client.prototype._get = function(endpoint, callback) {
  this._request('GET', endpoint, false, callback);
};

Client.prototype._post = function(endpoint, body, callback) {
  this._request('POST', endpoint, body, callback);
};

Client.prototype.importAddress = function(address, callback) {
  this._put('/addresses/' + address, function(err, res, body) {
    callback(err, res, body);
  });
};

Client.prototype.importAddresses = function(addresses, callback) {
  this._post('/addresses/', {addresses: addresses}, function(err, res, body) {
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
