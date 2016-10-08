'use strict';

var utils = require('../lib/utils');
var async = require('async');
var crypto = require('crypto');
var UnspentOutput = require('bitcore-lib').Transaction.UnspentOutput;
var bitcore = require('bitcore-lib');

exports.createWallet = function(opts, callback) {
  if (!opts.walletId) {
    opts.walletName = crypto.randomBytes(4).toString('hex');
    opts.walletId = utils.getWalletIdFromName(opts.walletName);
  }
  opts.client.createWallet(opts.walletId, function(err) {
    if(err) {
      return callback(err);
    }
    var response = {
      walletId: opts.walletId,
      walletName: opts.walletName
    };
    callback(null, response);
  });
};


exports.importWalletDat = function(opts, callback) {
  this.createWallet(opts, function(err, response) {
    if(err) {
      return callback(err);
    }
    utils.readWalletFile(opts.path, opts.config.getNetworkName(), function(err, addresses) {
      if (err) {
        callback(err);
      }
      //with very large wallets, this will double the memory requirements
      response.addresses = addresses.slice(0);
      var chunkSize = 2000;
      var chunks = utils.splitArray(addresses, chunkSize);
      async.eachSeries(chunks, function(chunk, next) {
        opts.client.importAddresses(response.walletId, chunk, function(err) {
          if (err) {
            callback(err);
          }
          next();
        });
      }, function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, response);
      });
    });
  });
};

exports.sendRawTx = function(opts, callback) {
  opts.bitcoinClient.sendRawTransaction(opts.rawTxHex, function(err) {
    if (err) {
      return callback(err);
    }
    opts.bitcoinClient.generate(1, function(err) {
      if (err) {
        return callback(err);
      }
      setTimeout(function() {
        opts.bitcoinClient.getAddressUtxos({'addresses': [opts.address]}, function(err, response) {
          if (err) {
            return callback(err);
          }
          if (response.result.length < 1) {
            return callback('no utxos found');
          }
          var newUtxo = new bitcore.Transaction.UnspentOutput(response.result[0]);
          callback(null, newUtxo);
        });
      }, 5000);
    });
  });
};

exports.spendCoinbaseTo = function(opts, callback) {
  var self = this;
  opts.bitcoinClient.listUnspent(function(err, response) {
    if (err) {
      return callback(err);
    }
    var utxos = response.result;
    var utxo;
    for(var i = 0; i < utxos.length; i++) {
      if (utxos[i].confirmations > 100) {
        utxo = new UnspentOutput(utxos[i]);
        break;
      }
    }
    if (!utxo) {
      return callback('utxo not found');
    }
    var amount = utxos[0].amount * 1E8 - 6000;
    var tx = bitcore.Transaction().fee(6000);
    tx.from(utxos[0])
    .to(opts.address, amount);
    opts.bitcoinClient.signRawTransaction(tx.serialize({
      disableIsFullySigned: true
    }), function(err, response) {
      if (err) {
        return callback(err);
      }
      opts.rawTxHex = response.result.hex;
      self.sendRawTx(opts, callback);
    });
  });
};


exports.sendFromUtxo = function(opts, callback) {
  var self = this;
  opts.address = opts.address.toString();
  var amount = opts.utxo.satoshis - 7000;
  var tx = bitcore.Transaction().fee(7000);
  tx.from(opts.utxo);
  tx.to(opts.address, amount);
  opts.bitcoinClient.signRawTransaction(tx.serialize({
    disableIsFullySigned: true
  }), function(err, response) {
    if (err) {
      return callback(err);
    }
    opts.rawTxHex = response.result.hex;
    self.sendRawTx(opts, callback);
  });
};

exports.sendJoinTypeTx = function(opts, callback) {
  var self = this;
  var externalUtxo = opts.utxo;
  opts.bitcoinClient.listUnspent(function(err, response) {
    if (err) {
      return callback(err);
    }
    var utxos = response.result;
    var ourUtxo;
    for(var i = 0; i < utxos.length; i++) {
      if (utxos[i].confirmations > 100) {
        ourUtxo = new UnspentOutput(utxos[i]);
        break;
      }
    }
    if (!ourUtxo) {
      return callback('utxo not found');
    }
    var amount = externalUtxo.satoshis;
    if (opts.amount) {
      amount = opts.amount;
    }
    amount = ourUtxo.satoshis + amount - 14000;
    var tx = bitcore.Transaction()
    .fee(14000)
    .from([externalUtxo, ourUtxo])
    .to(opts.address, amount)
    .change(opts.address)
    .sign([opts.privKey]);
    opts.bitcoinClient.signRawTransaction(tx.serialize({
      disableIsFullySigned: true
    }), function(err, response) {
      if (err) {
        return callback(err);
      }
      opts.rawTxHex = response.result.hex;
      self.sendRawTx(opts, callback);
    });
  });
};
