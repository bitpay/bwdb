'use strict';

var _ = require('lodash');
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
  this._dataStarted = false;
  this._stopStream = false;
  assert(this._limit > 0, 'Provided limit should be greater than 0.');
  assert(this._position.height >= 0, 'Provided starting height should be greater than or equal to 0.');
  assert(this._position.index >= 0, 'Provided starting index should be greater than or equal to 0.');
  assert(this._end >= this._position.height, 'Provided end height should be greater than or equal to starting height.');
}

inherits(TransactionsListStream, ReadableStream);

TransactionsListStream.prototype._formatItem = function(options) {
  var self = this;

  var item = {
    height: options.transaction.height,
    txid: options.transaction.hash,
    blockHash: options.transaction.blockHash,
    blockIndex: options.transaction.blockIndex,
    blockTime: options.transaction.blockTimestamp,
    category: options.type,
    confirmations: options.transaction.confirmations
  };

  if (_.isString(options.address)) {
    item.address = options.address;
  }

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

  return item;
};

TransactionsListStream.prototype._moveTransactionToList = function(transaction) {
  var list = [];
  var item = {
    transaction: transaction,
    type: 'receive',
  };
  if (this._showBitcoinAmount) {
    item.amount = utils.satoshisToBitcoin(transaction.walletDetails.outputSatoshis);
  } else {
    item.satoshis = transaction.walletDetails.inputSatoshis;
  }
  list.push(this._formatItem(item));
  item.type = 'send';
  if (this._showBitcoinAmount) {
    item.amount = utils.satoshisToBitcoin(transaction.walletDetails.outputSatoshis * -1);
  } else {
    item.satoshis = transaction.walletDetails.inputSatoshis * -1;
  }
  list.push(this._formatItem(item));
  list.push(this._formatFeeItem(transaction));
  return list;
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
  return feeItem;
};

TransactionsListStream.prototype._joinTransactionToList = function(transaction) {
  var self = this;
  var list = [];
  //reminder: inputs that do not have an address are pay-to-pub-key, they can't be tracked by bwdb
  //as such whenever these inputs are used, they will show up as join type tx's unless none of the
  //rest of the inputs are from our wallet
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
  return list;
};

TransactionsListStream.prototype._transactionToList = function(transaction) {
  /* jshint maxstatements: 30 */
  var self = this;

  var list = [];

  assert(utils.isInteger(this._bitcoinHeight), '"bitcoinHeight" is expected to be an integer');

  var walletDetails = WalletTransaction.getTransactionDetails(transaction);
  var walletDelta = walletDetails.outputSatoshis - walletDetails.inputSatoshis;
  transaction.confirmations = 1 + this._bitcoinHeight - transaction.height;

  if (walletDetails.type === 'join') {
    transaction.delta = walletDelta;
    return self._joinTransactionToList(transaction);
  } else if (walletDetails.type === 'move') {
    transaction.walletDetails = walletDetails;
    return self._moveTransactionToList(transaction);
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
  return list;
};

TransactionsListStream.prototype._push = function(bytes) {
  if (bytes === null && !this._dataStarted && this._stopStream) {
    this._dataStarted = true;
    return this.push('{"message": "no results found"}\n');
  }

  if (bytes === null && this._stopStream) {
    return this.push(null);
  }

  this._dataStarted = true;
  this.push(bytes);
};

TransactionsListStream.prototype._read = function() {
  var self = this;

  if (self._stopStream) {
    return self._push(null);
  }

  //VERY IMPORTANT: readable.push() should be called only ONCE per call to _read().
  //if called more than once, a race condition will ensue between subsequent calls to push()
  //This is because immediately upon return of the first call to push() with a non-null value, _read()
  //is then (re)called, which would result multiple calls to push() during that call.
  //Additionally, the same query must never be repeated (design choice). Later,
  //we may retry failed queries, but for right now, assert that previous queries never be repeated.
  var query = {
    height: self._position.height,
    index: self._position.index,
    limit: self._limit,
    end: self._end
  };

  self._client._get('/wallets/' + this._walletId + '/transactions', query, function(err, res, body) {
    if (err) {
      Error.captureStackTrace(err);
      return self.emit('error', err);
    }

    if (!_.isPlainObject(body) || !_.isPlainObject(body.start) || !_.isArray(body.transactions)) {
      return self.emit('error', new Error('Response from server was not properly formatted.'));
    }

    if (!self._bitcoinHeight) {
      self._bitcoinHeight = self._client.bitcoinHeight;
    }

    self._stopStream = !_.isPlainObject(body.end);

    var returnedPlaceholderDidNotChange = !self._stopStream &&
      (self._position.height === body.end.height && self._position.index === body.end.index);

    if (returnedPlaceholderDidNotChange) {
      throw 'Returned placeholder did not change from the last query. Placeholder height is: ' +
        self._position.height + ' placeholder index is: ' + self._position.index +
        ' body end height is: ' + body.end.height + ' body end index is: ' + body.end.index +
        '. This really SHOULD NOT happen. Either there are results to return or not, if results, ' +
        'then the body.end should change, if no results, there should NOT be a body.end object.';
    }

    self._position = body.end;

    sendTransactions(body.transactions);

    function sendTransactions(transactions) {
      var itemsJSON = '';
      for(var i = 0; i < transactions.length; i++) {
        var items = self._transactionToList(transactions[i]);
        for(var j = 0; j < items.length; j++) {
          itemsJSON += (JSON.stringify(items[j]) + '\n');
        }
      }
      self._push(itemsJSON === '' ? null : itemsJSON);
    }
  });
};


module.exports = TransactionsListStream;
