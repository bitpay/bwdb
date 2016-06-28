'use strict';

var assert = require('assert');

var bitcore = require('bitcore-lib');
var _ = require('lodash');

var prefixes = require('../prefixes');

/**
 * Used for persisting addresses for a wallet.
 * @param options
 * @param options.address - The base58 encoded address
 */
function WalletAddress(options) {
  if (!(this instanceof WalletAddress)) {
    return new WalletAddress(options);
  }
  assert(options.address, 'Address is required for a wallet key');
  this.address = new bitcore.Address(options.address);
}

WalletAddress.create = function(options) {
  options = options || {};
  // TODO validate
  var key = new WalletAddress(options);
  return key;
};

WalletAddress.prototype.toObject = WalletAddress.prototype.toJSON = function() {
  return {
    address: this.address.toObject()
  };
};

WalletAddress.prototype.getKey = function() {
  return Buffer.concat([prefixes.WALLET_KEY, this.address.hashBuffer]); // TODO include address type
};

WalletAddress.prototype.getValue = function() {
  return new Buffer(new Array(0));
};

module.exports = WalletAddress;
