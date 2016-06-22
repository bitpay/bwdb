'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');

/**
 * This is used to discover txids from a block that are relevant for a wallet. It will
 * get all of the addresses from the block. Currently it supports discovery of p2pkh and
 * standard p2sh addresses. Addresses are then checked against the address bloom filter
 * from a wallet to determine if the address is relevant, with a small degree of false
 * positives possible.
 *
 * @param {Object} options
 * @param {BloomFilter} addressFilter - The wallet's address bloom filter
 * @param {Network} network - A bitcore network
 */
function BlockHandler(options) {
  assert(options, 'First argument is expected to be options object');
  assert((options.addressFilter instanceof BloomFilter), 'options.addressFilter is expected to be a BloomFilter');
  assert(options.network, 'options.network is expected');
  this.addressFilter = options.addressFilter;
  this.network = options.network;
}

/**
 * Will get an address from an output if it matches the block handler bloom filter
 *
 * @param {Output} output - A bitcore output
 */
BlockHandler.prototype.getAddressFromOutput = function(output) {
  var script = output.script;

  // invalid scripts will not be instantiated as bitcore script objects
  if (!script) {
    return false;
  }

  // when we add support for new transaction types, such as SegWit transactions,
  // we will need to update this part, currently supports 'pubkeyhash' and 'scripthash'
  var address = script.toAddress(this.network);
  if (address && this.addressFilter.contains(address.hashBuffer)) {
    return address;
  }
  return false;
};

/**
 * Will get an address from an input if it matches the block handler bloom filter.
 *
 * Notice: This will only work for standard types of p2sh inputs as the redeem script
 * is classified to determine the address.
 *
 * @param {Input} input - A bitcore input
 */
BlockHandler.prototype.getAddressFromInput = function(input) {
  var script = input.script;

  // invalid scripts and coinbase input scripts will not be instantiated as bitcore script objects
  if (!script) {
    return false;
  }

  // when we add support for new transaction types, such as SegWit transactions,
  // we will need to update this part, currently supports 'pubkeyhash' and 'scripthash'
  if (script.isPublicKeyHashIn() || script.isScriptHashIn()) {
    var address = bitcore.Address.fromScript(script, this.network);
    if (address && this.addressFilter.contains(address.hashBuffer)) {
      return address;
    }
  }

  return false;
};

/**
 * Gets map of addresses to an array of output-like objects:
 * {
 *  '15urYnyeJe3gwbGJ74wcX89Tz7ZtsFDVew': [
 *    {txid: 44a08a1c6a9dd4a2257ca72858ac009b0f2ac8070ce68b87a3642259b74fd32c, receiving: true, index: 0},
 *    {txid: 44a08a1c6a9dd4a2257ca72858ac009b0f2ac8070ce68b87a3642259b74fd32c, receiving: true, index: 1}
 *  ]
 * }
 *
 * @param {Transaction} transaction - A bitcore transaction
 * @param {Number} blockIndex - The position of the transaction in a block
 */
BlockHandler.prototype.getAddressDeltasFromOutputs = function(transaction, blockIndex) {
  var addresses = {};
  var txid = transaction.hash;

  for (var i = 0; i < transaction.outputs.length; i++) {
    var output = transaction.outputs[i];
    var address = this.getAddressFromOutput(output);
    if (address) {
      var addressStr = address.toString();
      if (!addresses[addressStr]) {
        addresses[addressStr] = [];
      }
      addresses[addressStr].push({txid: txid, receiving: true, index: i, blockIndex: blockIndex});
    }
  }

  return addresses;
};

/**
 * Similar results as from getAddressDeltasFromOutputs however will have "receiving" false
 *
 * @param {Transaction} transaction - A bitcore transaction
 * @param {Number} blockIndex - The position of the transaction in a block
 */
BlockHandler.prototype.getAddressDeltasFromInputs = function(transaction, blockIndex) {
  var addresses = {};
  var txid = transaction.hash;

  for (var i = 0; i < transaction.inputs.length; i++) {
    var input = transaction.inputs[i];
    var address = this.getAddressFromInput(input);
    if (address) {
      var addressStr = address.toString();
      if (!addresses[addressStr]) {
        addresses[addressStr] = [];
      }
      addresses[addressStr].push({txid: txid, receiving: false, index: i, blockIndex: blockIndex});
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
BlockHandler.prototype.buildAddressDeltaList = function(block) {
  var addressDeltaList = {};

  for (var i = 0; i < block.transactions.length; i++) {
    var transaction = block.transactions[i];

    var outputAddresses = this.getAddressDeltasFromOutputs(transaction, i);
    for (var outputAddress in outputAddresses) {
      addressDeltaList[outputAddress] = outputAddresses[outputAddress];
    }

    var inputAddresses = this.getAddressDeltasFromInputs(transaction, i);
    for (var inputAddress in inputAddresses) {
      if (!addressDeltaList[inputAddress]) {
        addressDeltaList[inputAddress] = [];
      }
      addressDeltaList[inputAddress] = addressDeltaList[inputAddress].concat(inputAddresses[inputAddress]);
    }
  }

  return addressDeltaList;
};

module.exports = BlockHandler;
