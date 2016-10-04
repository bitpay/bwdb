'use strict';

var ReadableStream = require('stream').Readable;
var assert = require('assert');
var inherits = require('util').inherits;

function RawTransactionsStream(walletId, opts) {
  if (!(this instanceof RawTransactionsStream)) {
    return new RawTransactionsStream(walletId, opts);
  }
  ReadableStream.call(this, {
    objectMode: true
  });
  this._end = opts.end;
  this._walletId = walletId;
  this._client = opts.client;
  this._limit = opts.limit;
  this._ended = false;
  this._position = {
    height: opts.height,
    index: opts.index
  };
}
inherits(RawTransactionsStream, ReadableStream);

RawTransactionsStream.prototype._read = function() {
  var self = this;
  if (this._ended) {
    this.push(null);
    return;
  }
  var query = {
    height: this._position.height,
    index: this._position.index,
    limit: this._limit,
    end: this._end
  };
  this._client._get('/wallets/' + this._walletId + '/rawtransactions', query, function(err, res, body) {
    if (err) {
      Error.captureStackTrace(err);
      return self.emit('error', err);
    }
    if (self._position.height && self._position.index) {
      assert(self._position.height === body.start.height);
      assert(self._position.index === body.start.index);
    }
    if (!body.end) {
      self._ended = true;
      self.push(body.rawtransactions);
    } else {
      self._position = body.end;
      self.push(body.rawtransactions);
    }
  });
};

module.exports = RawTransactionsStream;
