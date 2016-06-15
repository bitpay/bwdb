'use strict';

var assert = require('assert');
var bson = require('bson');
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');
var BSON = new bson.BSONNative.BSON();
var _ = require('lodash');

var prefixes = require('../prefixes');

function Wallet(options) {
  if (!(this instanceof Wallet)) {
    return new Wallet(options);
  }
  assert(bitcore.util.js.isNaturalNumber(options.height), 'height is expected to be a natural number');
  assert(Buffer.isBuffer(options.blockHash), 'blockHash is expected to be a Buffer');
  assert((options.blockHash.length === 32), 'blockHash is expected to be 32 bytes');
  this.height = options.height;
  this.blockHash = options.blockHash;
  if (options.addressFilter) {
    this.addressFilter = new BloomFilter(options.addressFilter);
  } else {
    this.addressFilter = BloomFilter.create(Wallet.BLOOM_ADDRESSES, Wallet.BLOOM_FPR, false, false, true);
  }
  this.balance = options.balance || 0;
}

Wallet.BLOOM_ADDRESSES = 10000000; // 10 million
Wallet.BLOOM_FPR = 0.01; // false positive rate

Wallet.create = function(options) {
  options = options || {};
  var key = new Wallet(options);
  return key;
};

Wallet.fromBuffer = function(buffer) {
  assert(Buffer.isBuffer(buffer), 'First argument is expected to be a Buffer');
  var options = BSON.deserialize(buffer);
  options.blockHash = new Buffer(options.blockHash.buffer);
  options.addressFilter.vData = new Buffer(options.addressFilter.vData.buffer);
  return new Wallet(options);
};

Wallet.prototype.toObject = Wallet.prototype.toJSON = function() {
  return {
    height: this.height,
    blockHash: this.blockHash,
    addressFilter: this.addressFilter.toObject(),
    balance: this.balance
  };
};

Wallet.KEY = prefixes.WALLET_DATA;

Wallet.prototype.toBuffer = function() {
  return BSON.serialize(this.toObject());
};

Wallet.prototype.clone = function() {
  return new Wallet(this.toObject());
};

module.exports = Wallet;
