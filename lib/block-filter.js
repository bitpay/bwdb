'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');

/**
 * This is used to discover address deltas from a block that are relevant for a wallet. It
 * will get all of the addresses from the block. Addresses are then checked against the address
 * bloom filter to determine if the address is likely relevant.
 *
 * @param {Object} options
 * @param {BloomFilter} addressFilter - The address bloom filter (with pubkey hash160 inserted)
 * @param {Network} network - A bitcore network
 */
function BlockFilter(options) {
  assert(options, 'First argument is expected to be options object');
  assert((options.addressFilter instanceof BloomFilter), 'options.addressFilter is expected to be a BloomFilter');
  assert(options.network, 'options.network is expected');
  this.addressFilter = options.addressFilter;
  this.network = options.network;
}

/**
 * Will only return the address if passes through the address filter
 *
 * @param {Object} delta
 * @param {String=} delta.address - The base58check encoded address
 */
BlockFilter.prototype.filterAddress = function(delta) {
  if (!delta.address) {
    return false;
  }
  var address = bitcore.Address(delta.address);
  if (this.addressFilter.contains(address.hashBuffer)) {
    return address;
  }
  return false;
};

/**
 * Gets map of addresses to an array of output-like objects:
 * {
 *  '15urYnyeJe3gwbGJ74wcX89Tz7ZtsFDVew': [
 *    {
 *       txid: 44a08a1c6a9dd4a2257ca72858ac009b0f2ac8070ce68b87a3642259b74fd32c,
 *       receiving: true,
 *       index: 0,
 *       blockIndex: 300,
 *       satoshis: 50000000
 *    }
 *  ]
 * }
 *
 * @param {Object} transaction - A delta transaction from bitcoind `getblockdeltas`
 */
BlockFilter.prototype.getAddressDeltasFromOutputs = function(transaction) {
  var addresses = {};
  var txid = transaction.txid;
  var blockIndex = transaction.index;

  for (var i = 0; i < transaction.outputs.length; i++) {
    var output = transaction.outputs[i];
    var address = this.filterAddress(output);
    if (address) {
      var addressStr = address.toString();
      if (!addresses[addressStr]) {
        addresses[addressStr] = [];
      }
      addresses[addressStr].push({
        txid: txid,
        receiving: true,
        index: output.index,
        blockIndex: blockIndex,
        satoshis: output.satoshis
      });
    }
  }

  return addresses;
};

/**
 * Gets map of addresses to an array of output-like objects:
 * {
 *  '15urYnyeJe3gwbGJ74wcX89Tz7ZtsFDVew': [
 *    {
 *       txid: 44a08a1c6a9dd4a2257ca72858ac009b0f2ac8070ce68b87a3642259b74fd32c,
 *       receiving: false,
 *       index: 0,
 *       blockIndex: 300,
 *       satoshis: -50000000
 *       prevTxid: dc81f003d85056383f51f6fa449090767ef33f0a826b308bcaa189cdacc35985,
 *       prevIndex: 3
 *    }
 *  ]
 * }
 *
 * @param {Object} transaction - A delta transaction from bitcoind `getblockdeltas`
 */
BlockFilter.prototype.getAddressDeltasFromInputs = function(transaction) {
  var addresses = {};
  var txid = transaction.txid;
  var blockIndex = transaction.index;

  for (var i = 0; i < transaction.inputs.length; i++) {
    var input = transaction.inputs[i];
    var address = this.filterAddress(input);
    if (address) {
      var addressStr = address.toString();
      if (!addresses[addressStr]) {
        addresses[addressStr] = [];
      }
      addresses[addressStr].push({
        txid: txid,
        receiving: false,
        index: input.index,
        blockIndex: blockIndex,
        satoshis: input.satoshis,
        prevTxid: input.prevtxid,
        prevIndex: input.prevout
      });
    }
  }
  return addresses;
};

/**
 * Returns an object where the keys are addresses and the values are an object containing a txid,
 * an output/input index, and a boolean specifying if the tx was sending from the wallet or receiving
 * to that wallet. An entry will be created for each input and output to a wallet. "receiving" will
 * be false for inputs and true for outputs.
 *
 * Example:
 *  {
 *    '15urYnyeJe3gwbGJ74wcX89Tz7ZtsFDVew': [
 *      {
 *        txid: '44a08a1c6a9dd4a2257ca72858ac009b0f2ac8070ce68b87a3642259b74fd32c',
 *        blockIndex: 34,
 *        receiving: true,
 *        index: 1
 *      }
 *    ]
 *  }
 * @param {Block} block - A bitcore block
 */
BlockFilter.prototype.buildAddressDeltaList = function(block) {
  var self = this;
  var addressDeltaList = {};

  block.deltas.forEach(function(transaction) {
    var outputAddresses = self.getAddressDeltasFromOutputs(transaction);
    for (var outputAddress in outputAddresses) {
      addressDeltaList[outputAddress] = outputAddresses[outputAddress];
    }

    var inputAddresses = self.getAddressDeltasFromInputs(transaction);
    for (var inputAddress in inputAddresses) {
      if (!addressDeltaList[inputAddress]) {
        addressDeltaList[inputAddress] = [];
      }
      addressDeltaList[inputAddress] = addressDeltaList[inputAddress].concat(inputAddresses[inputAddress]);
    }
  });

  return addressDeltaList;
};

module.exports = BlockFilter;
