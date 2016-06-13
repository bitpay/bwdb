'use strict';

var assert = require('assert');
var bson = require('bson');
var BSON = new bson.BSONNative.BSON();
var _ = require('lodash');

function WalletKey(options) {
  if (!(this instanceof WalletKey)) {
    return new WalletKey(options);
  }
  assert(options.address, 'Address is required for a wallet key');
  this.address = options.address;
  // TODO handle encrypted keys
  this.privateKey = options.privateKey || null;
  this.publicKey = options.publicKey || null;
  this.cacheHeight = options.cacheHeight || 0;
  this.cacheHash = options.cacheHash || null;
}

WalletKey.create = function(options) {
  options = options || {};
  // TODO validate
  var key = new WalletKey(options);
  return key;
};

WalletKey.fromBuffer = function(buffer) {
  assert(Buffer.isBuffer(buffer), 'First argument is expected to be a Buffer');
  var options = BSON.deserialize(buffer);
  return new WalletKey(options);
};

WalletKey.prototype.toObject = WalletKey.prototype.toJSON = function() {
  return _.clone(this);
};

WalletKey.prototype.toBuffer = function() {
  return BSON.serialize(this.toObject());
};

module.exports = WalletKey;
