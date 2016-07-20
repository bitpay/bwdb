'use strict';

var assert = require('assert');
var ReadableStream = require('stream').Readable;
var inherits = require('util').inherits;

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

module.exports = TransactionsListStream;
