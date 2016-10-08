'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');
var bson = require('bson');
var BSON = new bson.BSONNative.BSON();

var utils = require('../utils');

/**
 * Used for persisting a detailed wallet transaction in JSON from getDetailedTransaction
 * See: https://github.com/bitpay/bitcore-node/blob/master/lib/services/bitcoind.js
 */
function WalletTransaction(walletId, value) {
  if (!(this instanceof WalletTransaction)) {
    return new WalletTransaction(walletId, value);
  }
  // TODO remove any values that should not be persisted
  this._initWalletId(walletId);
  this.value = value;
}

WalletTransaction.prototype._initWalletId = function(walletId) {
  if (Buffer.isBuffer(walletId)) {
    assert(walletId.length === 32, '"id" buffer is expected to be 32 bytes');
    this.walletId = walletId;
  } else {
    assert(bitcore.util.js.isHexa(walletId), '"id" is expected to be a hexa string if not a buffer');
    assert(walletId.length === 64, '"id" string is expected to have length of 64');
    this.walletId = new Buffer(walletId, 'hex');
  }
};

WalletTransaction.getKey = function(walletId, txid) {
  var walletIdBuffer = walletId;
  var txidBuffer = txid;
  if (!Buffer.isBuffer(txid)) {
    txidBuffer = new Buffer(txid, 'hex');
  }
  if (!Buffer.isBuffer(walletId)) {
    walletIdBuffer = new Buffer(walletId, 'hex');
  }
  var buffer = Buffer.concat([walletIdBuffer, txidBuffer]);
  return buffer;
};

WalletTransaction.create = function(walletId, options) {
  return new WalletTransaction(walletId, options);
};

WalletTransaction.fromBuffer = function(walletId, buffer) {
  return new WalletTransaction(walletId, BSON.deserialize(buffer));
};

WalletTransaction.prototype.getKey = function() {
  assert(bitcore.util.js.isHexa(this.value.hash), '"hash" is expected to be a hexadecimal string');
  var key = WalletTransaction.getKey(this.walletId, this.value.hash);
  return key;
};

WalletTransaction.prototype.getValue = function() {
  return BSON.serialize(this.value);
};

WalletTransaction.getDelta = function(transaction) {
  var details = WalletTransaction.getTransactionDetails(transaction);
  assert(utils.isInteger(details.outputSatoshis), 'Output satoshis must be an integer.');
  assert(utils.isInteger(details.inputSatoshis), 'Input satoshis must be an integer.');
  return details.outputSatoshis - details.inputSatoshis;
};
WalletTransaction.getTransactionDetails = function(transaction) {
  var details = WalletTransaction.getInputSatoshis(transaction);
  details.outputSatoshis = WalletTransaction.getOutputSatoshis(transaction);
  return WalletTransaction.classify(details);
};

WalletTransaction.getInputSatoshis = function(transaction) {
  var details = {
    inputSatoshis: 0,
    type: 'send',
    fee: transaction.feeSatoshis || 0
  };
  if (!transaction.coinbase) {
    var inWallet = transaction.inputs[0].wallet;
    for (var i = 0; i < transaction.inputs.length; i++) {
      var input = transaction.inputs[i];
      if (input.wallet !== inWallet) {
        details.type = 'join';
      }
      if (input.wallet) {
        assert(utils.isInteger(input.satoshis), '"satoshis" is expected to be an integer');
        details.inputSatoshis += input.satoshis;
      }
    }
  } else {
    details.type = 'coinbase';
  }
  return details;
};

WalletTransaction.getOutputSatoshis = function(transaction) {
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

WalletTransaction.isMove = function(txDetails) {
  //the input and output amounts are guaranteed to be related to our wallet addresses
  return txDetails.type !== 'coinbase' &&
    txDetails.inputSatoshis &&
    (txDetails.fee + txDetails.outputSatoshis) === txDetails.inputSatoshis;
};

WalletTransaction.isReceive = function(txDetails) {
  //if we have less money on our input side than on our output side, we
  //must be receiving incoming funds regardless of what the fees are
  return txDetails.type !== 'coinbase' &&
    txDetails.type !== 'join' &&
    txDetails.inputSatoshis < txDetails.outputSatoshis;
};

WalletTransaction.classify = function(txDetails) {
  if (!txDetails.inputSatoshis && !txDetails.outputSatoshis) {
    txDetails.type = 'not related';
  } else if (WalletTransaction.isMove(txDetails)) {
    txDetails.type = 'move';
  } else if (WalletTransaction.isReceive(txDetails)) {
    txDetails.type = 'receive';
  }
  return txDetails;
};

module.exports = WalletTransaction;
