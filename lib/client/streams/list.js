'use strict';

var ReadableStream = require('stream').Readable;
var assert = require('assert');
var inherits = require('util').inherits;

var WalletTransaction = require('../../models/transaction');
var utils = require('../../utils');

function TransactionsListStream(walletId, opts) {
  if (!(this instanceof TransactionsListStream)) {
    return new TransactionsListStream(walletId, opts);
  }
  ReadableStream.call(this);

  this._walletId = walletId;
  this._client = opts.client;
  this._limit = opts.limit;
  this._showBitcoinAmount = opts.showBitcoinAmount ? true : false;
  this._end = opts.end;
  this._position = {
    height: opts.height,
    index: opts.index
  };

  this._bitcoinHeight = null;
  this._dataEnded = false;
  this._arrayStarted = false;
  this._arrayEnded = false;
}

inherits(TransactionsListStream, ReadableStream);

TransactionsListStream.prototype._transactionToList = function(transaction, list) {
  /* jshint maxstatements: 20 */
  var self = this;

  assert(utils.isInteger(this._bitcoinHeight), '"bitcoinHeight" is expected to be an integer');

  var walletDelta = WalletTransaction.getDelta(transaction);
  var type = WalletTransaction.classify(transaction, walletDelta);
  var confirmations = 1 + this._bitcoinHeight - transaction.height;

  function formatItem(address, outputIndex, satoshis) {
    var item = {
      height: transaction.height,
      txid: transaction.hash,
      address: address,
      blockHash: transaction.blockHash,
      blockIndex: transaction.blockIndex,
      blockTime: transaction.blockTimestamp,
      category: type,
      outputIndex: outputIndex,
      confirmations: confirmations
    };

    if (self._showBitcoinAmount) {
      item.amount = utils.satoshisToBitcoin(satoshis);
    } else {
      item.satoshis = satoshis;
    }

    // Note that the fee is included in whole multiple times, and only if it's a
    // transaction with a negative delta
    if (satoshis < 0) {
      if (self._showBitcoinAmount) {
        item.fee = utils.satoshisToBitcoin(transaction.feeSatoshis);
      } else {
        item.feeSatoshis = transaction.feeSatoshis;
      }
    }

    return JSON.stringify(item);
  }

  for (var i = 0; i < transaction.outputs.length; i++) {
    var output = transaction.outputs[i];

    if (walletDelta > 0) {

      // Since we're receiving more than spending, we can consider any output
      // that is for this wallet an amount received

      // If this output is only part of the total received, use the amount specified
      // in the output. If the output is greater than the wallet received, only consider
      // the amount that is received considering the additonal amount as "change".

      // Each iteration we subtract the received amount from the delta to  keep track
      // of the total amount received.
      if (output.wallet) {
        var received = Math.min(output.satoshis, walletDelta);
        walletDelta -= received;
        list.push(formatItem(output.address, i, received));
      }

    } else if (walletDelta < 0) {

      // Since we're sending more than we're recieving, we can consider any output
      // other than our own to be sending to this output address. Any output that is
      // our own is "change".

      // It's only possible to send the amount we supplied, other inputs could have
      // supplied additional amounts, so we will only consider the amount sent be
      // up to the amount supplied.

      // It's also possible that this output is one of many, and in that case we should
      // keep track of the remaining available to be sent for the next iteration. In the
      // case that there isn't any remaining to be sent, it should include each with an
      // amount of zero. And information that is not in the blockchain would be necessary
      // to determine the percentage sent to each output.

      if (!output.wallet) {
        var sent = Math.min(output.satoshis, walletDelta * -1);
        walletDelta += sent;
        list.push(formatItem(output.address, i, sent * -1));
      }
    }
  }
};

TransactionsListStream.prototype._startArray = function() {
  this._arrayStarted = true;
  this.push('[');
};

TransactionsListStream.prototype._endArray = function() {
  this._arrayEnded = true;
  this.push(']\n');
};

TransactionsListStream.prototype._read = function() {
  var self = this;

  if (this._arrayEnded) {
    return this.push(null);
  } else if (this._dataEnded) {
    return this._endArray();
  } else if (!this._arrayStarted) {
    return this._startArray();
  }

  var query = {
    height: this._position.height,
    index: this._position.index,
    limit: this._limit
  };

  function getList(transactions) {
    var items = [];
    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      if (tx.height <= self._end) {
        self._dataEnded = true;
        break;
      }
      self._transactionToList(tx, items);
    }
    return items.join(',\n');
  }

  this._client._get('/wallets/' + this._walletId + '/transactions', query, function(err, res, body) {
    if (err) {
      Error.captureStackTrace(err);
      return self.emit('error', err);
    }

    // Set the height from the request headers, and keep the height
    // at the same position for the duration of the stream.
    if (!self._bitcoinHeight) {
      self._bitcoinHeight = self._client.bitcoinHeight;
    }

    if (self._position.height && self._position.index) {
      assert(self._position.height === body.start.height);
      assert(self._position.index === body.start.index);
    }

    if (!body.end) {
      self.push(getList(body.transactions));
      self._dataEnded = true;
    } else {
      self._position = body.end;
      self.push(getList(body.transactions));
      if (self._position.height <= self._end) {
        self._dataEnded = true;
      }
    }

  });
};

module.exports = TransactionsListStream;
