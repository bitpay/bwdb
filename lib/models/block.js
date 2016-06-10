'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');
var _ = require('lodash');

var VALID_BLOCK_ACTIONS = ['adding', 'removing'];

function Block() {}

Block.create = function(options) {
  options = options || {};
  Block._validateOptions(options);

  var block = new Block();

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

Block._validateOptions = function(options) {
  Block._validateHash(options.hash);
  Block._validateHeight(options.height);
  Block._validateAction(options.action);
  Block._validateFinished(options.finished);

  if (options.height > 0) {
    Block._validateHash(options.previousHash, true);
  } else {
    assert(options.previousHash === undefined, 'the genesis block should have no previousHash');
  }

  Block._validateNetwork(options.network);

  assert(options.hash !== options.previousHash, 'hash and previousHash must not be the same');
};

Block._validateHash = function(hash) {
  Block._validateBlockHash(hash, 'hash');
};

Block._validatePreviousHash = function(previousHash) {
  Block._validateBlockHash(previousHash, 'previousHash');
};

Block._validateBlockHash = function(blockHash, paramName) {
  paramName = paramName || 'hash';
  assert(blockHash !== undefined, paramName + ' is a required parameter');
  assert(typeof blockHash === 'string', paramName + ' must be a string');

  var blockHashRegex = /^[0-9a-f]{64}$/;
  assert(blockHash.match(blockHashRegex), 'invalid ' + paramName);
};

Block._validateHeight = function(height) {
  assert(height !== undefined, 'height is a required parameter ');
  assert(typeof height === 'number', 'height must be a number');
  assert(!isNaN(height), 'invalid height');
  assert(height >= 0, 'invalid height');
  assert(isFinite(height), 'invalid height');
  assert(height % 1 === 0, 'invalid height');
};

Block._validateNetwork = function(network) {
  assert(network !== undefined, 'network is a required parameter');
  assert(typeof network === 'string', 'network must be a string');
  assert(bitcore.Networks.get(network) !== undefined, 'invalid network');
};

Block._validateAction = function(action) {
  if (action === undefined) { // not a required param, at least for now
    return;
  }
  assert(typeof action === 'string', 'action must be a string');
  assert(VALID_BLOCK_ACTIONS.indexOf(action) !== -1, 'invalid action');
};

Block._validateFinished = function(finished) {
  if (finished === undefined) { // not a required param, at least for now
    return;
  }
  assert(typeof finished === 'boolean', 'finished must be a boolean');
};

Block.prototype.toObject = function() {
  return _.cloneDeep(this);
};

module.exports = Block;
