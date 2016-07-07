'use strict';

var assert = require('assert');
var ReadableStream = require('stream').Readable;
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

Client.prototype._request = function(method, endpoint, params, callback) {
  var self = this;

  var options = {
    method: method,
    uri: this.url + endpoint,
    json: true,
    headers: {
      'user-agent': 'bwsv2',
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

Client.prototype._get = function(endpoint, params, callback) {
  this._request('GET', endpoint, params, callback);
};

Client.prototype._post = function(endpoint, body, callback) {
  this._request('POST', endpoint, body, callback);
};

Client.prototype.createWallet = function(walletId, callback) {
  this._put('/wallets/' + walletId, function(err, res, body) {
    callback(err, res, body);
  });
};

Client.prototype.importAddress = function(walletId, address, callback) {
  this._put('/wallets/' + walletId + '/addresses/' + address, function(err, res, body) {
    callback(err, res, body);
  });
};

Client.prototype.importAddresses = function(walletId, addresses, callback) {
  this._post('/wallets/' + walletId + '/addresses/', {addresses: addresses}, function(err, res, body) {
    callback(err, res, body);
  });
};

Client.prototype.getTransactions = function(walletId, options, callback) {
  this._get('/wallets/' + walletId + '/transactions', options, function(err, res, body) {
    callback(err, res, body);
  });
};

function TransactionsStream(walletId, opts) {
  ReadableStream.call(this, {
    objectMode: true
  });
  this._walletId = walletId;
  this._client = opts.client;
  this._limit = opts.limit;
  this._position = {
    height: opts.height,
    index: opts.index
  };
}
inherits(TransactionsStream, ReadableStream);

Client.TransactionsStream = TransactionsStream;

TransactionsStream.prototype._read = function() {
  var self = this;
  var query = {
    height: this._position.height,
    index: this._position.index,
    limit: this._limit
  };
  this._client._get('/wallets/' + this._walletId + '/transactions', query, function(err, body) {
    if (err) {
      Error.captureStackTrace(err);
      return self.emit('error', err);
    }
    if (self._position.height && self._position.index) {
      assert(self._position.height === body.start.height);
      assert(self._position.index === body.start.index);
    }
    if (!body.end) {
      self.push(body.transactions);
      self.push(null);
    } else {
      self._position = body.end;
      self.push(body.transactions);
    }
  });
};

Client.prototype.getTransactionsStream = function(walletId, options) {
  options.client = this;
  var stream = new TransactionsStream(walletId, options);
  return stream;
};

Client.prototype.getTxids = function(walletId, options, callback) {
  this._get('/wallets/' + walletId + '/txids', options, function(err, res, body) {
    callback(err, res, body);
  });
};

function TxidsStream(walletId, opts) {
  ReadableStream.call(this, {
    objectMode: true
  });
  this._walletId = walletId;
  this._client = opts.client;
  this._limit = opts.limit;
  this._position = {
    height: opts.height,
    index: opts.index
  };
}
inherits(TxidsStream, ReadableStream);

Client.TxidsStream = TxidsStream;

TxidsStream.prototype._read = function() {
  var self = this;
  var query = {
    height: this._position.height,
    index: this._position.index,
    limit: this._limit
  };
  this._client._get('/wallets/' + this._walletId + '/txids', query, function(err, body) {
    if (err) {
      Error.captureStackTrace(err);
      return self.emit('error', err);
    }
    if (self._position.height && self._position.index) {
      assert(self._position.height === body.start.height);
      assert(self._position.index === body.start.index);
    }
    if (!body.end) {
      self.push(body.txids);
      self.push(null);
    } else {
      self._position = body.end;
      self.push(body.txids);
    }
  });
};

Client.prototype.getTxidsStream = function(walletId, options) {
  options.client = this;
  var stream = new TxidsStream(walletId, options);
  return stream;
};

Client.prototype.getBalance = function(walletId, callback) {
  var query = {};
  this._get('/wallets/' + walletId + '/balance', query, function(err, body) {
    if (err) {
      return callback(err);
    }
    callback(null, body);
  });
};

Client.prototype.getInfo = function(callback) {
  this._get('/info', {}, function(err, body) {
    if (err) {
      return callback(err);
    }
    callback(null, body);
  });
};

module.exports = Client;
