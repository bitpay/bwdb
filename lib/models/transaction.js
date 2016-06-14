'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');
var bson = require('bson');
var BSON = new bson.BSONNative.BSON();
var _ = require('lodash');

function WalletTransaction(options) {
  options = options || {};
  WalletTransaction._validateOptions(options);
  this.txid = options.txid;
  this.height = options.height;
  this.blockIndex = options.blockIndex;
}

WalletTransaction.create = function(options) {
  var tx = new WalletTransaction(options);
  return tx;
};

WalletTransaction._validateOptions = function(options) {
  WalletTransaction._validateTxid(options.txid);
  WalletTransaction._validateHeight(options.height);
  WalletTransaction._validateBlockIndex(options.blockIndex);
};

WalletTransaction._validateTxid = function(txid) {
  assert(Buffer.isBuffer(txid), 'txid is expected to be a buffer');
  assert(txid.length === 32, 'txid is expected to be 32 bytes');
};

WalletTransaction._validateHeight = function(height) {
  assert(bitcore.utils.isNaturalNumber(height), 'height is expected to be a natural number');
};

WalletTransaction._validateBlockIndex = function(blockIndex) {
  assert(bitcore.utils.isNaturalNumber(blockIndex), 'blockIndex is expected to be a natural number');
};

WalletTransaction.prototype.toBuffer = function() {
  var buffer = new Buffer(new Array(8));
  buffer.writeUInt32BE(this.height);
  buffer.writeUInt32BE(this.blockIndex, 4);
  return Buffer.concat([buffer, this.txid]);
};

WalletTransaction.fromBuffer = function(buffer) {
  var height = buffer.readUInt32BE(0);
  var blockIndex = buffer.readUInt32BE(4);
  var txid = buffer.slice(8, 40);
  return new WalletTransaction({
    height: height,
    blockIndex: blockIndex,
    txid: txid
  });
};

WalletTransaction.prototype.toObject = function() {
  return {
    txid: this.txid,
    height: this.height,
    blockIndex: this.blockIndex
  };
};

module.exports = WalletTransaction;
