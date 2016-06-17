'use strict';

var assert = require('assert');
var bson = require('bson');
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');
var BSON = new bson.BSONNative.BSON();
var _ = require('lodash');

var prefixes = require('../prefixes');

/**
 * Used to persist data about a wallet. This primarily consists of the current
 * sycronization status, block height and hash. As well as a bloom filter that
 * has all of the addresses for the wallet inserted. The bloom filter can then be
 * used to quickly determine if an address belows to the wallet. This also keeps
 * a running balance of the wallet, as of the block height and hash.
 *
 * @param {Object} options
 * @param {Number} options.height - The current height that the wallet has been synced
 * @param {Buffer} options.blockHash - The current block hash that the wallet has been synced
 * @param {Object} options.addressFilter - The data object for a BloomFilter
 * @param {Number} optinos.balance - The current balance of the wallet
 */
function Wallet(options) {
  if (!(this instanceof Wallet)) {
    return new Wallet(options);
  }
  assert(bitcore.util.js.isNaturalNumber(options.height), 'height is expected to be a natural number');
  this.height = options.height;
  this._initBlockHash(options);
  this._initAddressFilter(options);
  this._initBalance(options);
}

Wallet.prototype._initBalance = function(options) {
  if (options.balance) {
    assert(bitcore.util.js.isNaturalNumber(options.balance), 'balance is expected to be a natural number');
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

Wallet.prototype._initBlockHash = function(options) {
  if (Buffer.isBuffer(options.blockHash)) {
    assert(options.blockHash.length === 32, 'blockHash buffer is expected to be 32 bytes');
    this.blockHash = options.blockHash;
  } else {
    assert(bitcore.util.js.isHexa(options.blockHash), 'blockHash is expected to be a hexa string if not a buffer');
    assert(options.blockHash.length === 64, 'blockHash string is expected to have length of 64');
    this.blockHash = new Buffer(options.blockHash, 'hex');
  }
};

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
  return new Wallet(options);
};

Wallet.prototype.toObject = Wallet.prototype.toJSON = function() {
  return {
    height: this.height,
    blockHash: this.blockHash.toString('hex'),
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
