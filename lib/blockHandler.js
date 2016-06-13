'use strict';

var WalletTransaction = require('./models/transaction');
var async = require('async');
var bitcore = require('bitcore-lib');

function BlockHandler(options) {
  options = options || {};
  this.storage = options.storage;
  this.network = options.network || 'livenet';
}

/**
* Inserts new WalletTransaction documents into mongo for each transaction in the block associated with a BWS wallet
* "block" will be a bitcore block object + height attribute
*/
BlockHandler.prototype.handleAddBlock = function(block, callback) {
  var self = this;

  var addressDeltaList = this.buildAddressDeltaList(block);
  var newWalletDeltas = [];

  var addresses = Object.keys(addressDeltaList);

  this.storage.fetchAddressesForBlockHandler(addresses, function(err, addresses) {
    if (err) {
      return callback(err);
    }

    for (var i = 0; i < addresses.length; i++) {
      var addressObject = addresses[i];
      var addressString = addressObject.address;
      var walletId = addressObject.walletId;
      var transactions = addressDeltaList[addressString];
      for (var j = 0; j < transactions.length; j++) {
        var transaction = transactions[j];
        newWalletDeltas.push({
          address: addressString,
          walletId: walletId,
          txid: transaction.txid,
          receiving: transaction.receiving,
          blockHeight: block.height,
          network: self.network,
          index: transaction.index
        });
      }
    }

    async.eachSeries(newWalletDeltas, self.createWalletTransaction.bind(self), callback);
  });
};

BlockHandler.prototype.handleRemoveBlock = function(block, callback) {
  this.storage.removeWalletTransactionsAtBlockHeight(block.height, callback);
};

BlockHandler.prototype.createWalletTransaction = function(options, callback) {
  var walletTransaction = WalletTransaction.create(options);

  this.storage.storeWalletTransaction(walletTransaction, callback);
};

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

    var outputAddresses = this.getAddressDeltasFromOutputs(transaction);
    var inputAddresses = this.getAddressDeltasFromInputs(transaction);

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
BlockHandler.prototype.getAddressDeltasFromOutputs = function(transaction) {
  var addresses = {};
  var txid = transaction.hash;

  for (var i = 0; i < transaction.outputs.length; i++) {
    var output = transaction.outputs[i];
    var address = this.getAddressFromOutput(output);
    if (address) {
      if (!addresses[address]) {
        addresses[address] = [];
      }
      addresses[address].push({txid: txid, receiving: true, index: i});
    }
  }

  return addresses;
};


BlockHandler.prototype.getAddressDeltasFromInputs = function(transaction) {
  var addresses = {};
  var txid = transaction.hash;

  for (var i = 0; i < transaction.inputs.length; i++) {
    var input = transaction.inputs[i];
    var address = this.getAddressFromInput(input);
    if (address) {
      if (!addresses[address]) {
        addresses[address] = [];
      }

      addresses[address].push({txid: txid, receiving: false, index: i});
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
    return address.toString();
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
    return address.toString();
  }
};

module.exports = BlockHandler;
