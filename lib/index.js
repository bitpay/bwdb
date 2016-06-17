'use strict';

var assert = require('assert');
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
var utils = require('./utils');
var BlockHandler = require('./block-handler');

/**
 * A bitcore service for keeping a wallet with many addresses synchronized with the bitcoin
 * block chain. It will handle importing new addresses and keys after there has already been
 * partial sycroniziation, and will watch the wallet's addresses for changes and persist this
 * data for quick retrieval.
 *
 * @param {Object} options
 * @param {Node} options.node - The bitcore node instance that this service is running
 */
function BitcoinWallet(options) {
  EventEmitter.call(this);
  this.node = options.node;
  this.log = this.node.log;
  this.db = null;
  this.walletData = null;
  this.walletTxids = null;
  this.syncing = false;
  this.blockHandler = null;
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

BitcoinWallet.prototype._loadWalletData = function(callback) {
  var self = this;
  async.series([
    function(next) {
      self.db.get(models.Wallet.KEY, function(err, buffer) {
        if (utils.isNotFoundError(err)) {
          // wallet is brand new
          // TODO validate that keys and txs is also empty
          var height = self.node.services.bitcoind.height;
          var blockHash = self.node.services.bitcoind.tiphash;
          self.walletData = models.Wallet.create({height: height, blockHash: new Buffer(blockHash, 'hex')});
          next();
        } else if (err) {
          next(err);
        } else {
          self.walletData = models.Wallet.fromBuffer(buffer);
          next();
        }
      });
    },
    function(next) {
      self.db.get(models.WalletTxids.KEY, function(err, buffer) {
        if (utils.isNotFoundError(err)) {
          // wallet is brand new
          self.walletTxids = models.WalletTxids.create();
          next();
        } else if (err) {
          next(err);
        } else {
          self.walletTxids = models.WalletTxids.fromBuffer(buffer);
          next();
        }
      });
    }
  ], callback);

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

    self.blockHandler = new BlockHandler({
      network: self.node.network,
      addressFilter: self.walletData.addressFilter
    });

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

/**
 * This will insert txids into walletTxids and update the balance on walletData from
 * the address deltas. Both walletTxids and walletData do not modify the current wallet
 * reference, but the arguments passed into the function.

 * @param {WalletTxids} walletTxids - The current wallet txids data structure
 * @param {WalletData} walletData - The current wallet txids data structure
 * @param {Object} data
 * @param {Object} data.blockHeight - The block height of deltas
 * @param {String} data.address - The base58 encoded hex string
 * @param {String} data.deltas - The deltas for the address as returned from block handler
 * @param {Function} callback
 * @param {}
 */
BitcoinWallet.prototype._connectBlockAddressDeltas = function(walletTxids, walletData, data, callback) {
  var self = this;

  // Because it's possible to have false positives from the bloom filter, we need to
  // check that the address actually exists in the wallet before, and if it does not
  // we will continue along without making any modifications.
  var keyData = models.WalletKey({address: data.address});
  var keyDataKey = keyData.getKey();

  self.db.get(keyDataKey, function(err) {
    if (utils.isNotFoundError(err)) {
      return callback();
    } else if (err) {
      return callback(err);
    } else {
      for (var i = 0; i < data.deltas.length; i++) {
        var delta = data.deltas[i];
        walletTxids.insert(data.blockHeight, delta.blockIndex, new Buffer(delta.txid, 'hex'));
      }
      // TODO also adjust the balance on walletData
      callback();
    }
  });
};

/**
 * This will commit any changes to walletTxids and walletData to the database and update the
 * current wallet reference to this data.
 *
 * @param {WalletTxids} walletTxids
 * @param {WalletData} walletData
 * @param {Block} block - The block being commited
 * @param {Function} callback
 */
BitcoinWallet.prototype._connectBlockCommit = function(walletTxids, walletData, block, callback) {
  var self = this;

  // Update the latest status of the wallet
  walletData.blockHash = new Buffer(block.hash, 'hex');
  walletData.height = block.__height;

  // Prepare the leveldb database operations
  var ops = [];
  ops.push({
    type: 'put',
    key: models.Wallet.KEY,
    value: walletData.toBuffer()
  });
  ops.push({
    type: 'put',
    key: models.WalletTxids.KEY,
    value: walletTxids.toBuffer()
  });

  // Write all changes atomically
  self.db.batch(ops, function(err) {
    if (err) {
      return callback(err);
    }
    // Now finally update the current wallet reference data
    self.walletData = walletData;
    self.walletTxids = walletTxids;
    self.log.info('Block ' + block.hash + ' connected to wallet at height ' + block.__height);
    callback();
  });
};

/**
 * This will take a block and parse it for addresses that apply to this wallet
 * and update the database with the new transactions.
 * @param {Block} block
 * @param {Function} callback
 */
BitcoinWallet.prototype._connectBlock = function(block, callback) {
  var self = this;

  // This will get all relevant changes that apply to addresses in this wallet
  // using a bloom filter. The results will include the matching txids.
  var addressDeltas = this.blockHandler.buildAddressDeltaList(block);

  // Prevent in memory modifications until we know the changes
  // have been persisted to disk, so that the method can be reattempted without
  // causing state issues
  var walletData = this.walletData.clone();
  var walletTxids = this.walletTxids.clone();

  async.each(Object.keys(addressDeltas), function(address, next) {
    self._connectBlockAddressDeltas(walletTxids, walletData, {
      address: address,
      deltas: addressDeltas[address],
      blockHeight: block.__height,
    }, next);
  }, function(err) {
    if (err) {
      return callback(err);
    }
    self._connectBlockCommit(walletTxids, walletData, block, callback);
  });
};

BitcoinWallet.prototype._disconnectTip = function(callback) {
  // TODO
  setImmediate(callback);
};

BitcoinWallet.prototype.isSynced = function() {
  return (this.walletData.height === this.node.services.bitcoind.height);
};

/**
 * This will either add the next block to the wallet or will remove the current
 * block tip in the event of a reorganization.
 * @param {Number} height - The current height
 * @param {Function} callback
 */
BitcoinWallet.prototype._updateTip = function(height, callback) {
  var self = this;
  self.node.getRawBlock(height + 1, function(err, blockBuffer) {
    if (err) {
      return callback(err);
    }

    var block = Block.fromBuffer(blockBuffer);

    block.__height = height + 1;

    // TODO: expose prevHash as a string from bitcore
    var prevHash = BufferUtil.reverse(block.header.prevHash).toString('hex');

    if (prevHash === self.walletData.blockHash.toString('hex')) {

      // This block appends to the current chain tip and we can
      // immediately add it to the chain and create indexes.
      self._connectBlock(block, function(err) {
        if (err) {
          return callback(err);
        }
        self.emit('addblock', block);
        callback();
      });
    } else {
      // This block doesn't progress the current tip, so we'll attempt
      // to rewind the chain to the common ancestor of the block and
      // then we can resume syncing.
      self.log.warn('Reorg detected! Current tip: ' + self.walletData.blockHash.toString('hex'));
      self._disconnectTip(function(err) {
        if(err) {
          return callback(err);
        }
        self.log.warn('Disconnected current tip. New tip is ' + self.walletData.blockHash.toString('hex'));
        callback();
      });
    }
  });
};

/**
 * This function will continously update the block tip of the chain until it matches
 * the bitcoin height.
 */
BitcoinWallet.prototype.sync = function() {
  var self = this;
  if (self.syncing || self.node.stopping || !self.walletData || !self.walletTxids) {
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
    self._updateTip(height, done);
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
      setImmediate(function() {
        self.sync();
      });
    }
  });

};

BitcoinWallet.prototype._checkKeyImported = function(key, callback) {
  var keyData = models.WalletKey(key);
  var keyDataKey = keyData.getKey();
  this.db.get(keyDataKey, function(err) {
    if (utils.isNotFoundError(err)) {
      return callback();
    } else if (err) {
      return callback(err);
    } else {
      return callback(new Error('Key already imported'));
    }
  });
};

BitcoinWallet.prototype._wrapRPCError = function(errObj) {
  var err = new Error(errObj.message);
  err.code = errObj.code;
  return err;
};

BitcoinWallet.prototype._addKeyToWallet = function(walletTxids, walletData, keyData, callback) {
  var self = this;

  var bitcoind = this.node.services.bitcoind;
  var address = bitcore.Address(keyData.address, this.node.network);

  // TODO consider reorg at the same height by asserting that the block hash from the response
  // matches what is expected as our current block hash
  var query = {addresses: [keyData.address], start: 1, end: walletData.height};

  bitcoind.client.getAddressDeltas(query, function(err, response) {
    if (err) {
      return callback(self._wrapRPCError(err));
    }

    // find the balance delta and new transactions
    var balance = 0;
    var result = response.result;
    for (var i = 0; i < result.length; i++) {
      var delta = result[i];
      balance += delta.satoshis;
      walletTxids.insert(delta.height, delta.blockindex, new Buffer(delta.txid, 'hex'));
    }

    // update bloom filter with new address and add the balance
    walletData.addressFilter.insert(address.hashBuffer);
    walletData.balance += balance;

    callback();
  });
};

BitcoinWallet.prototype._commitWalletKey = function(walletTxids, walletData, keyData, callback) {
  var self = this;
  var ops = [
    {
      type: 'put',
      key: models.Wallet.KEY,
      value: walletData.toBuffer()
    },
    {
      type: 'put',
      key: models.WalletTxids.KEY,
      value: walletTxids.toBuffer()
    },
    {
      type: 'put',
      key: keyData.getKey(),
      value: keyData.getValue()
    }
  ];

  // write all changes atomically
  self.db.batch(ops, function(err) {
    if (err) {
      return callback(err);
    }
    self.walletTxids = walletTxids;
    self.walletData = walletData;
    callback();
  });
};

/**
 * Will import an address and key pair into the wallet and will keep track
 * of the balance and transactions.
 * @param {Object} key
 * @param {String} key.address - The base58 encoded address
 * @param {String} key.privateKey - The hex string of the private key
 * @param {String} key.publicKey - The hex string for the public key
 */
BitcoinWallet.prototype.importWalletKey = function(key, callback) {
  var self = this;
  if (self.syncing) {
    // TODO possibly add to queue or wait instead of giving back an error
    return callback(new Error('Sync or import in progress'));
  }
  self.syncing = true;

  var keyData = models.WalletKey(key);

  var walletData = self.walletData.clone();
  var walletTxids = self.walletTxids.clone();

  async.series([
    function(next) {
      self._checkKeyImported(key, next);
    },
    function(next) {
      self._addKeyToWallet(walletTxids, walletData, keyData, next);
    }
  ], function(err) {
    if (err) {
      self.syncing = false;
      return callback(err);
    }
    self._commitWalletKey(walletTxids, walletData, keyData, function(err) {
      self.syncing = false;
      if (err) {
        return callback(err);
      }
      callback();
    });
  });
};

BitcoinWallet.prototype._validateFromAndTo = function(options) {
  assert(bitcore.util.js.isNaturalNumber(options.from), '"from" is expected to be a natural number');
  assert(bitcore.util.js.isNaturalNumber(options.to), '"to" is expected to be a natural number');
  assert(options.from < options.to, '"from" is expected to be less than "to"');
  assert(options.to - options.from <= 500, '"from" and "to" range exceeds maximum');
};

/**
 * Will get the latest transaction ids for the wallet.
 * @param options
 * @param options.from - The starting position, example 0
 * @param options.to - The ending position, example 10
 * @param options.buffers - Include results as a buffer
 */
BitcoinWallet.prototype.getWalletTxids = function(options, callback) {
  if (!options) {
    options = {};
  }

  if (!options.from || !options.to) {
    options.from = 0;
    options.to = 10;
  }

  try {
    this._validateFromAndTo(options);
  } catch(err) {
    return callback(err);
  }

  var txids = this.walletTxids.getLatest(options.from, options.to);

  setImmediate(function() {
    var result = txids;
    if (!options.buffers) {
      result = txids.map(function(txid) {
        return txid.toString('hex');
      });
    }
    callback(null, result);
  });
};

BitcoinWallet.prototype.getAPIMethods = function() {
  var methods = [
    ['importWalletKey', this, this.importWalletKey, 1],
    ['getWalletTxids', this, this.getWalletTxids, 1]
  ];
  return methods;
};

BitcoinWallet.prototype.getPublishEvents = function() {
  return [];
};

module.exports = BitcoinWallet;
