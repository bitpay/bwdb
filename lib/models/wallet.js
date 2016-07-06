'use strict';

var assert = require('assert');
var bson = require('bson');
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');
var BSON = new bson.BSONNative.BSON();
var _ = require('lodash');

var utils = require('../utils');

/**
 * Represents the state of an individual wallet. This primarily consists of the current
 * sycronization status, block height and hash. As well as a bloom filter that
 * has all of the addresses for the wallet inserted. The bloom filter can then be
 * used to quickly determine if an address belongs to the wallet. This also keeps
 * a running balance of the wallet, as of the block height and hash.
 *
 * @param {Object} options
 * @param {Buffer} options.id - The id of the wallet
 * @param {Object} options.addressFilter - The data object for a BloomFilter
 * @param {Number} optinos.balance - The current balance of the wallet
 */
function Wallet(options) {
  if (!(this instanceof Wallet)) {
    return new Wallet(options);
  }
  this._initId(options);
  this._initAddressFilter(options);
  this._initBalance(options);
}

Wallet.prototype._initId = function(options) {
  if (Buffer.isBuffer(options.id)) {
    assert(options.id.length === 32, '"id" buffer is expected to be 32 bytes');
    this.id = options.id;
  } else {
    assert(bitcore.util.js.isHexa(options.id), '"id" is expected to be a hexa string if not a buffer');
    assert(options.id.length === 64, '"id" string is expected to have length of 64');
    this.id = new Buffer(options.id, 'hex');
  }
};

Wallet.prototype._initBalance = function(options) {
  if (options.balance) {
    assert(bitcore.util.js.isNaturalNumber(options.balance), '"balance" is expected to be a natural number');
  }
  this.balance = options.balance || 0;
};

Wallet.prototype._initAddressFilter = function(options) {
  if (options.addressFilter) {
    assert(options.addressFilter.vData);
    if (options.addressFilter.vData.buffer) {
      // BSON Binary back into a Node.js Buffer
      options.addressFilter.vData = new Buffer(options.addressFilter.vData.buffer);
    }
    this.addressFilter = new BloomFilter(options.addressFilter);
  } else {
    this.addressFilter = BloomFilter.create(Wallet.BLOOM_ADDRESSES, Wallet.BLOOM_FPR, false, false, true);
  }
};

Wallet.BLOOM_ADDRESSES = 3000000; // 3 million
Wallet.BLOOM_FPR = 0.01; // false positive rate

Wallet.create = function(options) {
  options = options || {};
  var key = new Wallet(options);
  return key;
};

Wallet.fromBuffer = function(buffer) {
  assert(Buffer.isBuffer(buffer), 'First argument is expected to be a Buffer');
  var options = BSON.deserialize(buffer);
  return new Wallet(options);
};

Wallet.prototype.toObject = Wallet.prototype.toJSON = function() {
  // TODO the id/key is also included in the value
  return {
    id: this.id.toString('hex'),
    addressFilter: this.addressFilter.toObject(),
    balance: this.balance
  };
};

Wallet.prototype.getKey = function(encoding) {
  if (encoding === 'hex') {
    return this.id.toString('hex');
  }
  return this.id;
};

Wallet.prototype.addBalance = function(balance) {
  assert(utils.isInteger(balance), '"balance" is expected to be an integer');
  this.balance += balance;
};

Wallet.prototype.getValue = function() {
  return BSON.serialize(this.toObject());
};

Wallet.prototype.clone = function() {
  return new Wallet(this.toObject());
};

module.exports = Wallet;
