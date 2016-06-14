'use strict';

var fs = require('fs');
var inherits = require('util').inherits;
var path = require('path');
var EventEmitter = require('events').EventEmitter;

var async = require('async');
var bitcore = require('bitcore-lib');
var Block = bitcore.Block;
var BufferUtil = bitcore.util.buffer;
var mkdirp = require('mkdirp');
var leveldown = require('leveldown');

var models = require('./models');

function BitcoinWallet(options) {
  EventEmitter.call(this);
  this.node = options.node;
  this.log = this.node.log;
  this.db = null;
  this.walletData = null;
  this.syncing = false;
}
inherits(BitcoinWallet, EventEmitter);

BitcoinWallet.dependencies = ['bitcoind'];

BitcoinWallet.prototype._getApplicationDir = function() {
  var appPath = path.resolve(process.env.HOME, './.bwsv2');
  return appPath;
};

BitcoinWallet.prototype._setupApplicationDirectory = function(callback) {
  var appPath = this._getApplicationDir();
  fs.access(appPath, function(err) {
    if (err && err.code === 'ENOENT') {
      return mkdirp(appPath, callback);
    } else if (err) {
      return callback(err);
    }
    callback();
  });
};

BitcoinWallet.prototype._getDatabasePath = function() {
  var appPath = this._getApplicationDir();
  var databasePath;
  if (this.node.network === bitcore.Networks.livenet) {
    databasePath = path.resolve(appPath, './wallet-livenet.db');
  } else if (this.node.network === bitcore.Networks.testnet) {
    if (this.node.network.regtestEnabled) {
      databasePath = path.resolve(appPath, './wallet-regtest.db');
    } else {
      databasePath = path.resolve(appPath, './wallet-testnet3.db');
    }
  } else {
    throw new Error('Unknown network: ' + this.network);
  }
  return databasePath;
};


BitcoinWallet.prototype._setupDatabase = function(callback) {
  var self = this;
  var path = self._getDatabasePath();
  this.db = leveldown(path);
  this.db.open({
    createIfMissing: true
  }, callback);
};

BitcoinWallet.prototype.start = function(callback) {
  var self = this;

  async.series([
    function(next) {
      self._setupApplicationDirectory(next);
    },
    function(next) {
      self._setupDatabase(next);
    },
    function(next) {
      self._loadWalletData(next);
    }
  ], function(err) {
    if (err) {
      return callback(err);
    }

    self.emit('ready');
    self.log.info('Wallet Ready');
    self.sync();

    self.node.services.bitcoind.on('tip', function() {
      if(!self.node.stopping) {
        self.sync();
      }
    });
    callback();
  });

};

BitcoinWallet.prototype.stop = function(callback) {
  if (this.db) {
    this.db.close(callback);
  } else {
    setImmediate(callback);
  }
};

BitcoinWallet.prototype._connectBlock = function(block, callback) {
   setImmediate(callback);
};

BitcoinWallet.prototype._disconnectTip = function(callback) {
  setImmediate(callback);
};

BitcoinWallet.prototype._loadWalletData = function(callback) {
  var self = this;
  this.db.get(models.Wallet.getKey(), function(err, buffer) {
    if (err && err.notFound) {
      // wallet is brand new
      // TODO validate that keys and txs is also empty
      var height = self.node.services.bitcoind.height;
      var blockHash = self.node.services.bitcoind.tiphash;
      self.walletData = models.Wallet.create({height: height, blockHash: blockHash});
    } else if (err) {
      return callback(err);
    }
    self.walletData = models.Wallet.fromBuffer(buffer);
    callback();
  });
};

BitcoinWallet.prototype.isSynced = function() {
  return (this.walletData.height === this.node.services.bitcoind.height);
};

BitcoinWallet.prototype.sync = function() {
  var self = this;

  if (self.syncing || self.node.stopping || !self.walletData) {
    return;
  }

  self.syncing = true;

  var height;
  async.whilst(function() {
    if (self.node.stopping) {
      return false;
    }
    height = self.walletData.height;
    return height < self.node.services.bitcoind.height;
  }, function(done) {
    self.node.getRawBlock(height + 1, function(err, blockBuffer) {
      if (err) {
        return done(err);
      }

      var block = Block.fromBuffer(blockBuffer);

      // TODO: expose prevHash as a string from bitcore
      var prevHash = BufferUtil.reverse(block.header.prevHash).toString('hex');

      if (prevHash === self.walletData.blockHash) {

        // This block appends to the current chain tip and we can
        // immediately add it to the chain and create indexes.
        self._connectBlock(block, function(err) {
          if (err) {
            return done(err);
          }
          self.emit('addblock', block);
          done();
        });
      } else {
        // This block doesn't progress the current tip, so we'll attempt
        // to rewind the chain to the common ancestor of the block and
        // then we can resume syncing.
        self.log.warn('Reorg detected! Current tip: ' + self.walletData.blockHash);
        self._disconnectTip(function(err) {
          if(err) {
            return done(err);
          }
          self.log.warn('Disconnected current tip. New tip is ' + self.walletData.blockHash);
          done();
        });
      }
    });
  }, function(err) {
    if (err) {
      Error.captureStackTrace(err);
      return self.node.emit('error', err);
    }

    if (self.node.stopping) {
      self.syncing = false;
      return;
    }

    if (self.isSynced()) {
      self.syncing = false;
      self.node.emit('synced');
    } else {
      self.syncing = false;
      self.sync();
    }

  });

};

/**
 * @param {Object} key
 * @param {String} key.address - The base58 encoded address
 * @param {String} key.privateKey - The hex string of the private key
 * @param {String} key.publicKey - The hex string for the public key
 */
BitcoinWallet.prototype.importKey = function(key, callback) {
  var self = this;
  if (self.syncing) {
    // TODO add to queue or wait?
    return callback(new Error('Sync or import in progress'));
  }

  self.syncing = true;

  var address = bitcore.Address(key.address);
  var keyData = models.WalletKey(key);
  var keyDataKey = keyData.getKey();
  var ops = [];

  async.series([
    function checkImported(next) {
      self.db.get(keyDataKey, function(err) {
        if (err && err.notFound) {
          return next();
        } else if (err) {
          return next(err);
        } else {
          return next(new Error('Key already imported'));
        }
      });
    },
    function prepareOperations(next) {
      var walletData = self.walletData.clone();

      var bitcoind = self.node.services.bitcoind;
      // TODO consider reorg at the same height
      var query = {addresses: [key.address], start: 1, end: self.walletData.height};
      bitcoind.client.getAddressDeltas(query, function(err, response) {
        if (err) {
          bitcoind._wrapRPCError(err);
        }

        // find the balance delta and new transactions
        var balance = 0;
        var result = response.result;
        for (var i = 0; i < result.length; i++) {
          var delta = result[i];
          balance += delta.satoshis;
          var tx = models.WalletTransaction({
            txid: delta.txid,
            height: delta.height,
            blockIndex: delta.blockindex
          });
          ops.push({
            type: 'put',
            key: tx.getKey(),
            value: tx.getValue()
          });
        }

        // update bloom filter with new address and add the balance
        walletData.filter.insert(address.hashBuffer);
        walletData.balance += balance;

        ops.push({
          type: 'put',
          key: BitcoinWallet.KEYS.WALLET_DATA,
          value: walletData.getValue()
        });

        // update keys and transactions
        ops.push({
          type: 'put',
          key: keyData.getKey(),
          value: keyData.getValue()
        });

        next();

      });

    },
  ], function(err) {
    if (err) {
      self.syncing = false;
      return callback(err);
    }

    // write all changes atomically
    self.db.batch(ops, function(err) {
      self.syncing = false;
      if (err) {
        return callback(err);
      }
      callback();
    });
  });
};

BitcoinWallet.prototype.getAPIMethods = function() {
  var methods = [
    ['importKey', this, this.importKey, 1]
  ];
  return methods;
};

BitcoinWallet.prototype.getPublishEvents = function() {
  return [];
};

module.exports = BitcoinWallet;
