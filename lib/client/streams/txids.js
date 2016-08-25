'use strict';

var assert = require('assert');
var ReadableStream = require('stream').Readable;
var inherits = require('util').inherits;

function TxidsStream(walletId, opts) {
  ReadableStream.call(this, {
    objectMode: true
  });
  this._walletId = walletId;
  this._client = opts.client;
  this._limit = opts.limit;
  this._ended = false;
  this._position = {
    height: opts.height,
    index: opts.index
  };
}
inherits(TxidsStream, ReadableStream);

TxidsStream.prototype._read = function() {
  var self = this;
  if (this._ended) {
    this.push(null);
    return;
  }
  var query = {
    height: this._position.height,
    index: this._position.index,
    limit: this._limit
  };
  this._client._get('/wallets/' + this._walletId + '/txids', query, function(err, res, body) {
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
      self._ended = true;
    } else {
      self._position = body.end;
      self.push(body.txids);
    }
  });
};

module.exports = TxidsStream;
