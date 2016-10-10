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
  this._dataStarted = false;
}

inherits(TransactionsListStream, ReadableStream);

TransactionsListStream.prototype._formatItem = function(options) {
  var self = this;

  var item = {
    height: options.transaction.height,
    txid: options.transaction.hash,
    address: options.address,
    blockHash: options.transaction.blockHash,
    blockIndex: options.transaction.blockIndex,
    blockTime: options.transaction.blockTimestamp,
    category: options.type,
    confirmations: options.transaction.confirmations
  };

  if (options.outputIndex >= 0) {
    item.outputIndex = options.outputIndex;
  } else if (options.inputIndex >= 0) {
    item.inputIndex = options.inputIndex;
  }

  if (self._showBitcoinAmount) {
    item.amount = utils.satoshisToBitcoin(options.satoshis);
  } else {
    item.satoshis = options.satoshis;
  }

  return JSON.stringify(item);
};

TransactionsListStream.prototype._moveTransactionToList = function(transaction, list) {
  var self = this;

  var item = {
    transaction: transaction,
    type: 'send',
  };
  var inputs = transaction.inputs;
  for(var i = 0; i < inputs.length; i++) {
    item.inputIndex = i;
    item.address = inputs[i].address;
    item.satoshis = inputs[i].satoshis * -1;
    list.push(self._formatItem(item));
  }
  item.type = 'receive';
  var outputs = transaction.outputs;
  for (var j = 0; j < outputs.length; j++) {
    item.outputIndex = j;
    item.address = outputs[j].address;
    item.satoshis = outputs[j].satoshis;
    list.push(self._formatItem(item));
  }
  list.push(self._formatFeeItem(transaction));
};

TransactionsListStream.prototype._formatFeeItem = function(transaction) {

  if (!transaction.feeSatoshis) {
    return;
  }

  var self = this;

  var feeItem = {
    confirmations: transaction.confirmations,
    height: transaction.height,
    txid: transaction.hash,
    blockHash: transaction.blockHash,
    blockTime: transaction.blockTimestamp,
    category: 'fee',
  };

  if (self._showBitcoinAmount) {
    feeItem.amount = -1 * utils.satoshisToBitcoin(transaction.feeSatoshis);
  } else {
    feeItem.satoshis = -1 * transaction.feeSatoshis;
  }
  return JSON.stringify(feeItem);
};

TransactionsListStream.prototype._joinTransactionToList = function(transaction, list) {
  var self = this;
  var item = {
    transaction: transaction,
    satoshis: transaction.delta,
    address: ''
  };
  if (transaction.delta > 0) {
    item.type = 'shared-receive';
  } else if (transaction.delta < 0) {
    item.type = 'shared-send';
  } else {
    item.type = 'shared-equal';
  }
  list.push(self._formatItem(item));
};

TransactionsListStream.prototype._transactionToList = function(transaction, list) {
  /* jshint maxstatements: 30 */
  var self = this;

  assert(utils.isInteger(this._bitcoinHeight), '"bitcoinHeight" is expected to be an integer');

  var walletDetails = WalletTransaction.getTransactionDetails(transaction);
  var walletDelta = walletDetails.outputSatoshis - walletDetails.inputSatoshis;
  transaction.confirmations = 1 + this._bitcoinHeight - transaction.height;

  if (walletDetails.type === 'join') {
    transaction.delta = walletDelta;
    return self._joinTransactionToList(transaction, list);
  } else if (walletDetails.type === 'move') {
    return self._moveTransactionToList(transaction, list);
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
        list.push(self._formatItem({
          type: walletDetails.type,
          transaction: transaction,
          address: output.address,
          outputIndex: i,
          satoshis: received
        }));
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
        list.push(self._formatItem({
          type: walletDetails.type,
          transaction: transaction,
          address: output.address,
          outputIndex: i,
          satoshis: sent * -1
        }));
      }
    }
  }
  if (walletDetails.type === 'send') {
    list.push(self._formatFeeItem(transaction));
  }
};

TransactionsListStream.prototype._read = function() {
  var self = this;

  if (self._dataEnded) {
    return self.push(null);
  }

  var query = {
    height: this._position.height,
    index: this._position.index,
    limit: this._limit,
    end: this._end
  };

  function getList(transactions) {
    var items = [];
    var prepend = '';
    if (self._dataStarted) {
      prepend = '\n';
    }
    for (var i = 0; i < transactions.length; i++) {
      self._dataStarted = true;
      var tx = transactions[i];
      if (tx.height <= self._end) {
        self._dataEnded = true;
        break;
      }
      self._transactionToList(tx, items);
    }
    return prepend + items.join('\n');
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
      self._dataEnded = true;
      var endList = getList(body.transactions);
      if (!endList || endList.length < 1) {
        self.push('\n');
      }
      self.push(endList);
    } else if (body.end.height === self._position.height && body.end.index === self._position.index) {
      self._dataEnded = true;
    } else {
      self._position = body.end;
      if (self._position.height <= self._end) {
        self._dataEnded = true;
      }
      self.push(getList(body.transactions));
    }

  });
};

module.exports = TransactionsListStream;
