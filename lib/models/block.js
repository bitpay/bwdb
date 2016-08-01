'use strict';

var assert = require('assert');
var bson = require('bson');
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');
var BSON = new bson.BSONNative.BSON();

/**
 * Represents the high level block chain state of the database for all wallets. A bloom
 * filter is kept updated that has all addresses that are being tracked for all wallets.
 * The current height and block hash is recorded and should always be synchronized with
 * the height and block hash for each wallet. The entries can be pruned after a period of
 * time once confirmation has reached irreversible thresholds.
 *
 * @param {Object} options
 * @param {Number} options.height - The current height
 * @param {BlockHash} options.blockHash - The current block hash
 * @param {Object} options.addressFilter - The data object for a BloomFilter
 */
function WalletBlock(height, values) {
  if (!(this instanceof WalletBlock)) {
    return new WalletBlock(height, values);
  }

  // TODO store all address deltas for this block
  this.height = height;
  this._initBlockHash(values);
  this._initAddressFilter(values);
  this.deltas = values.deltas;
  this.spentOutputs = values.spentOutputs;
}

WalletBlock.BLOOM_ADDRESSES = 10000000; // 10 million
WalletBlock.BLOOM_FPR = 0.01; // false positive rate

WalletBlock.prototype._initAddressFilter = function(values) {
  if (values.addressFilter) {
    assert(values.addressFilter.vData);
    if (!Buffer.isBuffer(values.addressFilter.vData) && values.addressFilter.vData.buffer) {
      // BSON Binary back into a Node.js Buffer
      values.addressFilter.vData = new Buffer(values.addressFilter.vData.buffer);
    }
    this.addressFilter = new BloomFilter(values.addressFilter);
  } else {
    this.addressFilter = BloomFilter.create(WalletBlock.BLOOM_ADDRESSES, WalletBlock.BLOOM_FPR, false, false, true);
  }
};

WalletBlock.prototype._initBlockHash = function(values) {
  if (Buffer.isBuffer(values.blockHash)) {
    assert(values.blockHash.length === 32, 'blockHash buffer is expected to be 32 bytes');
    this.blockHash = values.blockHash;
  } else {
    assert(bitcore.util.js.isHexa(values.blockHash), 'blockHash is expected to be a hexa string if not a buffer');
    assert(values.blockHash.length === 64, 'blockHash string is expected to have length of 64');
    this.blockHash = new Buffer(values.blockHash, 'hex');
  }
};

WalletBlock.create = function(height, blockHash) {
  var block = new WalletBlock(height, {blockHash: blockHash});
  return block;
};

WalletBlock.fromBuffer = function(keyString, valueBuffer) {
  var keyBuffer = new Buffer(keyString, 'hex');
  var height = keyBuffer.readUInt32BE(0);
  var values = BSON.deserialize(valueBuffer);
  return new WalletBlock(height, values);
};

WalletBlock.prototype.getValueObject = function() {
  return {
    blockHash: this.blockHash.toString('hex'),
    addressFilter: this.addressFilter.toObject(), // TODO toBuffer
    deltas: this.deltas,
    spentOutputs: this.spentOutputs
  };
};

WalletBlock.getKey = function(height, encoding) {
  var buffer = new Buffer(new Array(4));
  buffer.writeUInt32BE(height);
  if (encoding === 'hex') {
    return buffer.toString('hex');
  }
  return buffer;
};

WalletBlock.prototype.getKey = function(encoding) {
  return WalletBlock.getKey(this.height, encoding);
};

WalletBlock.prototype.getValue = function() {
  return BSON.serialize(this.getValueObject());
};

WalletBlock.prototype.clone = function() {
  return new WalletBlock(this.height, this.getValueObject());
};

module.exports = WalletBlock;
