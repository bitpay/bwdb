'use strict';

var bson = require('bson');
var BSON = new bson.BSONNative.BSON();
var _ = require('lodash');

/**
 * Used for persisting a detailed wallet transaction in JSON from getDetailedTransaction
 * See: https://github.com/bitpay/bitcore-node/blob/master/lib/services/bitcoind.js
 */
function WalletTransaction(data) {
  if (!(this instanceof WalletTransaction)) {
    return new WalletTransaction(data);
  }
  // TODO possibly remove any values that should not be persisted
  // or only persist the data once a sufficient number of confirmations
  _.extend(this, data);
}

WalletTransaction.create = function(options) {
  return new WalletTransaction(options);
};

WalletTransaction.fromBuffer = function(buffer) {
  return new WalletTransaction(BSON.deserialize(buffer));
};

WalletTransaction.prototype.toBuffer = function() {
  return BSON.serialize(this);
};

WalletTransaction.prototype.toObject = function() {
  return _.clone(this);
};

module.exports = WalletTransaction;
