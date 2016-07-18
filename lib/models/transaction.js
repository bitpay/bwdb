'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');
var bson = require('bson');
var BSON = new bson.BSONNative.BSON();
var _ = require('lodash');

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

WalletTransaction.getKey = function(walletId, txid, encoding) {
  var walletIdBuffer = walletId;
  var txidBuffer = txid;
  if (!Buffer.isBuffer(txid)) {
    txidBuffer = new Buffer(txid, 'hex');
  }
  if (!Buffer.isBuffer(walletId)) {
    walletIdBuffer = new Buffer(walletId, 'hex');
  }
  var buffer = Buffer.concat([walletIdBuffer, txidBuffer]);
  if (encoding === 'hex') {
    return buffer.toString('hex');
  }
  return buffer;
};

WalletTransaction.create = function(walletId, options) {
  return new WalletTransaction(walletId, options);
};

WalletTransaction.fromBuffer = function(walletId, buffer) {
  return new WalletTransaction(walletId, BSON.deserialize(buffer));
};

WalletTransaction.prototype.getKey = function(encoding) {
  assert(bitcore.util.js.isHexa(this.value.hash), '"hash" is expected to be a hexadecimal string');
  var key = WalletTransaction.getKey(this.walletId, this.value.hash, encoding);
  return key;
};

WalletTransaction.prototype.getValue = function() {
  return BSON.serialize(this.value);
};

module.exports = WalletTransaction;
