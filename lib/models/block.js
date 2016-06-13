'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');
var bson = require('bson');
var BSON = new bson.BSONNative.BSON();
var _ = require('lodash');

var VALID_BLOCK_ACTIONS = ['adding', 'removing'];

function WalletBlock() {}

WalletBlock.create = function(options) {
  options = options || {};
  WalletBlock._validateOptions(options);

  var block = new WalletBlock();

  block.hash = options.hash;
  block.previousHash = options.previousHash;
  block.height = options.height;
  block.network = options.network;

  if (options.action !== undefined) {
    block.action = options.action;
  }

  if (options.finished !== undefined) {
    block.finished = options.finished;
  }

  return block;
};

WalletBlock._validateOptions = function(options) {
  WalletBlock._validateHash(options.hash);
  WalletBlock._validateHeight(options.height);
  WalletBlock._validateAction(options.action);
  WalletBlock._validateFinished(options.finished);

  if (options.height > 0) {
    WalletBlock._validateHash(options.previousHash, true);
  } else {
    assert(options.previousHash === undefined, 'the genesis block should have no previousHash');
  }

  WalletBlock._validateNetwork(options.network);

  assert(options.hash !== options.previousHash, 'hash and previousHash must not be the same');
};

WalletBlock._validateHash = function(hash) {
  WalletBlock._validateWalletBlockHash(hash, 'hash');
};

WalletBlock._validatePreviousHash = function(previousHash) {
  WalletBlock._validateWalletBlockHash(previousHash, 'previousHash');
};

WalletBlock._validateWalletBlockHash = function(blockHash, paramName) {
  paramName = paramName || 'hash';
  assert(blockHash !== undefined, paramName + ' is a required parameter');
  assert(typeof blockHash === 'string', paramName + ' must be a string');

  var blockHashRegex = /^[0-9a-f]{64}$/;
  assert(blockHash.match(blockHashRegex), 'invalid ' + paramName);
};

WalletBlock._validateHeight = function(height) {
  assert(height !== undefined, 'height is a required parameter ');
  assert(typeof height === 'number', 'height must be a number');
  assert(!isNaN(height), 'invalid height');
  assert(height >= 0, 'invalid height');
  assert(isFinite(height), 'invalid height');
  assert(height % 1 === 0, 'invalid height');
};

WalletBlock._validateNetwork = function(network) {
  assert(network !== undefined, 'network is a required parameter');
  assert(typeof network === 'string', 'network must be a string');
  assert(bitcore.Networks.get(network) !== undefined, 'invalid network');
};

WalletBlock._validateAction = function(action) {
  if (action === undefined) { // not a required param, at least for now
    return;
  }
  assert(typeof action === 'string', 'action must be a string');
  assert(VALID_BLOCK_ACTIONS.indexOf(action) !== -1, 'invalid action');
};

WalletBlock._validateFinished = function(finished) {
  if (finished === undefined) { // not a required param, at least for now
    return;
  }
  assert(typeof finished === 'boolean', 'finished must be a boolean');
};

WalletBlock.prototype.toObject = function() {
  return _.cloneDeep(this);
};

WalletBlock.prototype.toBuffer = function() {
  return BSON.serialize(this.toObject());
};

module.exports = WalletBlock;
