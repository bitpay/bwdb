'use strict';

var assert = require('assert');

var bitcore = require('bitcore-lib');
var bson = require('bson');
var BSON = new bson.BSONNative.BSON();
var _ = require('lodash');

var prefixes = require('../prefixes');

function WalletKey(options) {
  if (!(this instanceof WalletKey)) {
    return new WalletKey(options);
  }
  assert(options.address, 'Address is required for a wallet key');
  this.address = options.address;
  // TODO handle encrypted keys
  this.privateKey = options.privateKey || null;
  this.publicKey = options.publicKey || null;
}

WalletKey.create = function(options) {
  options = options || {};
  // TODO validate
  var key = new WalletKey(options);
  return key;
};

WalletKey.prototype.setValue = function(buffer) {
  var values = BSON.deserialize(buffer);
  this.privateKey = values.privateKey;
  this.publicKey = values.publicKey;
};

WalletKey.prototype.toObject = WalletKey.prototype.toJSON = function() {
  return _.clone(this);
};

WalletKey.prototype.getKey = function() {
  var address = bitcore.Address(this.address);
  return Buffer.concat([prefixes.WALLET_KEY, address.hashBuffer]); // TODO include address type
};

WalletKey.prototype.getValue = function() {
  return BSON.serialize({
    privateKey: this.privateKey,
    publicKey: this.publicKey
  });
};

module.exports = WalletKey;
