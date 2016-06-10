'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');
var _ = require('lodash');

function WalletTransaction() {}

WalletTransaction.create = function(options) {
  options = options || {};
  WalletTransaction._validateOptions(options);

  var walletTransaction = new WalletTransaction();

  walletTransaction.network = options.network;
  walletTransaction.address = options.address;
  walletTransaction.walletId = options.walletId;
  walletTransaction.txid = options.txid;
  walletTransaction.blockHeight = options.blockHeight;
  walletTransaction.receiving = options.receiving;
  walletTransaction.index = options.index; // this can be an output index or an input index based on receiving
  return walletTransaction;
};

WalletTransaction._validateOptions = function(options) {
  WalletTransaction._validateNetwork(options.network);
  WalletTransaction._validateAddress(options.address, options.network);
  WalletTransaction._validateWalletId(options.walletId);
  WalletTransaction._validateTxid(options.txid);
  WalletTransaction._validateBlockHeight(options.blockHeight);
  WalletTransaction._validateReceiving(options.receiving);
};

WalletTransaction._validateAddress = function(address, network) {
  assert(address !== undefined, 'address is a required parameter');
  assert(typeof address === 'string', 'address must be a string');

  var isValidAddress = bitcore.Address.isValid(address, network);
  assert(isValidAddress, 'invalid address');
};

WalletTransaction._validateWalletId = function(walletId) {
  assert(walletId !== undefined, 'walletId is a required parameter');
  assert(typeof walletId === 'string', 'walletId must be a string');
};

WalletTransaction._validateTxid = function(txid) {
  assert(txid !== undefined, 'txid is a required parameter');
  assert(typeof txid === 'string', 'txid must be a string');

  var txidRegex = /^[0-9a-f]{64}$/;
  assert(txid.match(txidRegex), 'invalid txid');
};

WalletTransaction._validateBlockHeight = function(blockHeight) {
  assert(blockHeight !== undefined, 'blockHeight is a required parameter ');
  assert(typeof blockHeight === 'number', 'blockHeight must be a number');
  assert(!isNaN(blockHeight), 'invalid blockHeight');
  assert(blockHeight >= 0, 'invalid blockHeight');
  assert(isFinite(blockHeight), 'invalid blockHeight');
  assert(blockHeight % 1 === 0, 'invalid blockHeight');
};

WalletTransaction._validateReceiving = function(receiving) {
  assert(typeof receiving === 'boolean', 'receiving must be a boolean');
};

WalletTransaction._validateNetwork = function(network) {
  assert(network !== undefined, 'network is a required parameter');
  assert(typeof network === 'string', 'network must be a string');
  assert(bitcore.Networks.get(network) !== undefined, 'invalid network');
};

WalletTransaction.prototype.toObject = function() {
  // can we do cloning with something more simple than lodash?
  return _.cloneDeep(this);
};

module.exports = WalletTransaction;
