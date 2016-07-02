'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');

var utils = require('../utils');

/**
 * Used for mapping walletIds to an address.
 * @param {String} address - The base58 encoded address
 * @param {Array} walletIds - An array of walledIds buffers
 */
function WalletAddressMap(address, walletIds, network) {
  if (!(this instanceof WalletAddressMap)) {
    return new WalletAddressMap(address, walletIds);
  }
  assert(Array.isArray(walletIds), '"walletIds" is expected to be an array');
  assert(address, '"address" is required for a wallet address');
  assert(network, '"network" is expected');
  this.address = new bitcore.Address(address, network);
  this.walletIds = walletIds;
}

WalletAddressMap.create = function(address, walletIds, network) {
  var ids = walletIds.map(function(walletId) {
    if (Buffer.isBuffer(walletId)) {
      assert(walletId.length === 32, '"walletId" buffer is expected to have length of 32');
      return walletId;
    } else {
      assert(walletId.length === 64, '"walletId" string is expected to have length of 64');
      return new Buffer(walletId, 'hex');
    }
  });
  var key = new WalletAddressMap(address, ids, network);
  return key;
};

WalletAddressMap.fromBuffer = function(keyString, value, network) {
  var keyBuffer = new Buffer(keyString.slice(0, 21) + keyString.slice(21, 42), 'hex');
  var type = utils.getAddressTypeString(keyBuffer);
  var hashBuffer = keyBuffer.slice(1, 21);
  var address = new bitcore.Address({
    hashBuffer: hashBuffer,
    type: type,
    network: network
  });
  var walletIds = utils.splitBuffer(value, 32);
  return new WalletAddressMap(address, walletIds, network);
};

WalletAddressMap.getKey = function(addressArg, encoding, network) {
  assert(network, '"network" is expected');
  var address = new bitcore.Address(addressArg, network);
  var type = utils.getAddressTypeBuffer(address);
  var key = Buffer.concat([type, address.hashBuffer]);
  if (encoding === 'hex') {
    return key.toString('hex');
  }
  return key;
};

WalletAddressMap.prototype.getKey = function(encoding) {
  return WalletAddressMap.getKey(this.address, encoding, this.address.network);
};

WalletAddressMap.prototype.getValue = function() {
  return Buffer.concat(this.walletIds);
};

WalletAddressMap.prototype.insert = function(walletId) {
  var walletIdBuffer = walletId;
  if (!Buffer.isBuffer(walletId)) {
    walletIdBuffer = new Buffer(walletId, 'hex');
  }
  this.walletIds.push(walletIdBuffer);
};

module.exports = WalletAddressMap;
