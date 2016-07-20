'use strict';

var assert = require('assert');
var ReadableStream = require('stream').Readable;
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

var request = require('request');
var io = require('socket.io-client');

var utils = require('./utils');

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

    if (res.statusCode >= 500) {
      return callback(new Error(res.statusCode + ' Server Error: ' + body));
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

function TransactionsListStream(walletId, opts) {
  ReadableStream.call(this, {
    objectMode: true
  });
  this._walletId = walletId;
  this._client = opts.client;
  this._limit = opts.limit;
  this._end = opts.end;
  this._ended = false;
  this._position = {
    height: opts.height,
    index: opts.index
  };
}

inherits(TransactionsListStream, ReadableStream);

Client.TransactionsListStream = TransactionsListStream;

TransactionsListStream.prototype._transactionToList = function(tx, list) {

};

TransactionsListStream.prototype._read = function() {
  var self = this;
  if (this._ended) {
    this.push(null);
    return;
  }

  if (!this._headerSent) {
    this._headerSent = true;
    this.push(this._header);
    return;
  }

  var query = {
    height: this._position.height,
    index: this._position.index,
    limit: this._limit
  };

  function getList(transactions) {
    var list = [];
    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      if (tx.height <= self._end) {
        self._ended = true;
        break;
      }
      self._transactionToList(tx, list);
    }
    return list;
  }

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
      self.push(getList(body.transactions));
      self._ended = true;
    } else {
      self._position = body.end;
      self.push(getList(body.transactions));

      if (self._position.height <= self._end) {
        self._ended = true;
      }
    }
  });
};

function TransactionsCSVStream(walletId, opts) {
  ReadableStream.call(this);
  this._walletId = walletId;
  this._client = opts.client;
  this._limit = opts.limit;
  this._end = opts.end;
  this._ended = false;
  this._header = 'Date,Height,Txid,Type,Bitcoin,Destination Address\n';
  this._headerSent = false;
  this._position = {
    height: opts.height,
    index: opts.index
  };
}
inherits(TransactionsCSVStream, ReadableStream);

Client.TransactionsCSVStream = TransactionsCSVStream;

TransactionsCSVStream.prototype._getWalletInputSatoshis = function(transaction) {
  var satoshis = 0;
  if (!transaction.coinbase) {
    for (var i = 0; i < transaction.inputs.length; i++) {
      var input = transaction.inputs[i];
      if (input.wallet) {
        assert(utils.isInteger(input.satoshis), '"satoshis" is expected to be an integer');
        satoshis += input.satoshis;
      }
    }
  }
  return satoshis;
};

TransactionsCSVStream.prototype._getWalletOutputSatoshis = function(transaction) {
  var satoshis = 0;
  for (var i = 0; i < transaction.outputs.length; i++) {
    var output = transaction.outputs[i];
    if (output.wallet) {
      assert(utils.isInteger(output.satoshis), '"satoshis" is expected to be an integer');
      satoshis += output.satoshis;
    }
  }
  return satoshis;
};

TransactionsCSVStream.prototype._isJoinTransaction = function(transaction) {
  if (!transaction.coinbase) {
    var wallet = transaction.inputs[0].wallet;
    for (var i = 1; i < transaction.inputs.length; i++) {
      if (transaction.inputs[i].wallet !== wallet) {
        return true;
      }
    }
  }
  return false;
};

TransactionsCSVStream.prototype._classifyTransaction = function(transaction, delta) {
  assert(utils.isInteger(delta), '"delta" is expected to be an integer');
  if (transaction.coinbase) {
    return 'coinbase';
  } else if (this._isJoinTransaction(transaction)) {
    return 'join';
  } else if (delta > 0) {
    return 'receive';
  } else if (delta < 0) {
    return 'send';
  } else {
    return 'move';
  }
};

TransactionsCSVStream.prototype._transactionToCSV = function(transaction) {
  /* jshint maxstatements: 25 */

  var result = '';

  function formatRow(data) {
    return data.join(',') + '\n';
  }

  var walletInputs = this._getWalletInputSatoshis(transaction);
  var walletOutputs = this._getWalletOutputSatoshis(transaction);
  var walletDelta = walletOutputs - walletInputs;

  if (walletDelta === 0) {
    // There was no change in balance, the export does not need to
    // include any information.
    return result;
  }

  var type = this._classifyTransaction(transaction, walletDelta);

  for (var j = 0; j < transaction.outputs.length; j++) {
    var output = transaction.outputs[j];

    if (walletDelta > 0) {

      // Since we're receiving more than spending, we can consider any output
      // that is for this wallet an amount received
      if (output.wallet) {

        // If this output is only part of the total received, use
        // the amount specified in the output. If the output is greater
        // than the wallet received, only consider the amount that is received
        // considering the additonal amount as "change".
        var received = Math.min(output.satoshis, walletDelta);

        // Subtract the received amount from the delta, for the next
        // iteration to use.
        walletDelta -= received;

        result += formatRow([
          utils.timestampToISOString(transaction.blockTimestamp),
          transaction.height,
          transaction.hash,
          type,
          utils.satoshisToBitcoin(received),
          output.address
        ]);

      }
    } else if (walletDelta < 0) {

      // Since we're sending more than we're recieving, we can consider
      // any output other than our own to be sending to this output address.
      // Any output that is our own is "change".
      if (!output.wallet) {

        // It's only possible to send the amount we supplied, other inputs
        // could have supplied additional amounts, so we will only consider
        // the amount sent be up to the amount supplied.
        var sent = Math.min(output.satoshis, walletDelta * -1);

        // It's also possible that this output is one of many, and in that
        // case we should keep track of the remaining available to be sent
        // for the next iteration. In the case that there isn't any remaining
        // to be sent, it should include each with an amount of zero. And
        // information that is not in the blockchain would be necessary to
        // determine the percentage sent to each output.
        walletDelta += sent;

        result += formatRow([
          utils.timestampToISOString(transaction.blockTimestamp),
          transaction.height,
          transaction.hash,
          type,
          utils.satoshisToBitcoin(sent * -1),
          output.address
        ]);

      }
    }
  }

  // Any remaining spent amount is considered paying to miners
  // and does not have an output and considered the "fee".
  if (walletDelta < 0) {
    result += formatRow([
      utils.timestampToISOString(transaction.blockTimestamp),
      transaction.height,
      transaction.hash,
      'fee',
      utils.satoshisToBitcoin(walletDelta),
      null
    ]);
  }

  return result;
};

TransactionsCSVStream.prototype._read = function() {
  var self = this;
  if (this._ended) {
    this.push(null);
    return;
  }

  if (!this._headerSent) {
    this._headerSent = true;
    this.push(this._header);
    return;
  }

  var query = {
    height: this._position.height,
    index: this._position.index,
    limit: this._limit
  };

  function getRows(transactions) {
    var result = '';
    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      if (tx.height <= self._end) {
        self._ended = true;
        break;
      }
      var rows = self._transactionToCSV(tx);
      result += rows;
    }
    return result;
  }

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
      self.push(getRows(body.transactions));
      self._ended = true;
    } else {
      self._position = body.end;
      self.push(getRows(body.transactions));

      // Check if we've reached the end
      // TODO do not end inbetween a block
      if (self._position.height <= self._end) {
        self._ended = true;
      }
    }
  });
};

Client.prototype.getTransactionsCSVStream = function(walletId, options) {
  options.client = this;
  var stream = new TransactionsCSVStream(walletId, options);
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
