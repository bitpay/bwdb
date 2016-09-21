'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');

var utils = require('../utils');

/**
 * Used for persisting addresses for a wallet.
 * @param {Buffer} walletId
 * @param {String} address - The base58 encoded address
 */
function WalletAddress(walletId, address) {
  if (!(this instanceof WalletAddress)) {
    return new WalletAddress(walletId, address);
  }
  assert(walletId, '"walletId" is required for a wallet address');
  assert(address, '"address" is required for a wallet address');
  this._initWalletId(walletId);
  this.address = new bitcore.Address(address);
}

WalletAddress.prototype._initWalletId = function(walletId) {
  if (Buffer.isBuffer(walletId)) {
    assert(walletId.length === 32, '"id" buffer is expected to be 32 bytes');
    this.walletId = walletId;
  } else {
    assert(bitcore.util.js.isHexa(walletId), '"id" is expected to be a hexa string if not a buffer');
    assert(walletId.length === 64, '"id" string is expected to have length of 64');
    this.walletId = new Buffer(walletId, 'hex');
  }
};

WalletAddress.create = function(walletId, address) {
  var key = new WalletAddress(walletId, address);
  return key;
};

WalletAddress.prototype.toObject = WalletAddress.prototype.toJSON = function() {
  return {
    address: this.address.toString(),
    walletId: this.walletId.toString('hex')
  };
};

WalletAddress.fromBuffer = function(key, value, network) {
  var keyBuf = key;
  if (!Buffer.isBuffer(key)) {
    keyBuf = new Buffer(key, 'hex');
  }
  key = keyBuf;
  var walletId = key.slice(0, 32);
  var type = utils.getAddressTypeString(key.slice(32, 33));
  var address = new bitcore.Address({
    hashBuffer: key.slice(1, 21),
    type: type,
    network: network
  });
  return new WalletAddress(walletId, address);
};

WalletAddress.prototype.getKey = function() {
  var type = utils.getAddressTypeBuffer(this.address);
  var key = Buffer.concat([this.walletId, type, this.address.hashBuffer]);
  return key;
};

WalletAddress.prototype.getValue = function() {
  // TODO used for storing information about the address
  return new Buffer(new Array(0));
};

module.exports = WalletAddress;
