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
* Returns an object where the keys are addresses and the values are an object containing a txid, an output/input index,
* and a boolean specifying if the tx was sending from the wallet or receiving to that wallet. An entry will be created
* for each input and output to a wallet. "receiving" will be false for inputs and true for outputs.
*
* example:
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
*/

// maybe instead of "receiving", we should just explicitly state if it is an input or an output
BlockHandler.prototype.buildAddressDeltaList = function(block) {
  var addressDeltaList = {};

  for (var i = 0; i < block.transactions.length; i++) {
    var transaction = block.transactions[i];

    var outputAddresses = this.getAddressDeltasFromOutputs(transaction, i);
    var inputAddresses = this.getAddressDeltasFromInputs(transaction, i);

    getTxidsForOutputs();
    getTxidsForInputs();
  }

  return addressDeltaList;


  function getTxidsForOutputs() {
    var addressStrings = Object.keys(outputAddresses);

    for (var i = 0; i < addressStrings.length; i++) {
      var addressString = addressStrings[i];

      if (!addressDeltaList[addressString]) {
        addressDeltaList[addressString] = [];
      }

      addressDeltaList[addressString] = addressDeltaList[addressString].concat(outputAddresses[addressString]);
    }
  }

  function getTxidsForInputs() {
    var addressStrings = Object.keys(inputAddresses);

    for (var i = 0; i < addressStrings.length; i++) {
      var addressString = addressStrings[i];

      if (!addressDeltaList[addressString]) {
        addressDeltaList[addressString] = [];
      }

      addressDeltaList[addressString] = addressDeltaList[addressString].concat(inputAddresses[addressString]);
    }
  }
};

//gets map of addresses to an array of output-like objects
/*
{
  '15urYnyeJe3gwbGJ74wcX89Tz7ZtsFDVew': [
    {txid: 44a08a1c6a9dd4a2257ca72858ac009b0f2ac8070ce68b87a3642259b74fd32c, receiving: true, index: 0},
    {txid: 44a08a1c6a9dd4a2257ca72858ac009b0f2ac8070ce68b87a3642259b74fd32c, receiving: true, index: 1}
  ]
}
*/
BlockHandler.prototype.getAddressDeltasFromOutputs = function(transaction, blockIndex) {
  var addresses = {};
  var txid = transaction.hash;

  for (var i = 0; i < transaction.outputs.length; i++) {
    var output = transaction.outputs[i];
    var address = this.getAddressFromOutput(output);
    if (address && this.addressFilter.contains(address.hashBuffer)) {
      var addressStr = address.toString();
      if (!addresses[addressStr]) {
        addresses[addressStr] = [];
      }
      addresses[addressStr].push({txid: txid, receiving: true, index: i, blockIndex: blockIndex});
    }
  }

  return addresses;
};


BlockHandler.prototype.getAddressDeltasFromInputs = function(transaction, blockIndex) {
  var addresses = {};
  var txid = transaction.hash;

  for (var i = 0; i < transaction.inputs.length; i++) {
    var input = transaction.inputs[i];
    var address = this.getAddressFromInput(input);
    if (address && this.addressFilter.contains(address.hashBuffer)) {
      var addressStr = address.toString();
      if (!addresses[addressStr]) {
        addresses[addressStr] = [];
      }
      addresses[addressStr].push({txid: txid, receiving: false, index: i, blockIndex: blockIndex});
    }
  }

  return addresses;
};

BlockHandler.prototype.getAddressFromOutput = function(output) {
  var script = output.script;

  if (!script) { // invalid scripts will not be instantiated as bitcore script objects
    return;
  }

  var address = script.toAddress(this.network);
  // when we add support for new transaction types, such as SegWit transactions, we will need to update this part
  if (address.type === 'pubkeyhash' || address.type === 'scripthash') {
    return address;
  }
};

BlockHandler.prototype.getAddressFromInput = function(input) {
  var script = input.script;

  if (!script) { // invalid scripts and coinbase input scripts will not be instantiated as bitcore script objects
    return;
  }

  // when we add support for new transaction types, such as SegWit transactions, we will need to update this part
  if (script.isPublicKeyHashIn() || script.isScriptHashIn()) {
    var address = bitcore.Address.fromScript(script, this.network);
    return address;
  }
};

module.exports = BlockHandler;
