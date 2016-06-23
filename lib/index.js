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
var lmdb = require('node-lmdb');

var models = require('./models');
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
  this.bitcoind = null;
  this.db = null;
  this.walletData = null;
  this.syncing = false;
  this.blockHandler = null;
  this.defaults = {
    historyBlockRange: options.historyBlockRange || BitcoinWallet.DEFAULT_HISTORY_BLOCK_RANGE,
    historyConcurrency: options.historyConcurrency || BitcoinWallet.DEFAULT_HISTORY_CONCURRENCY
  };
}
inherits(BitcoinWallet, EventEmitter);

BitcoinWallet.dependencies = ['bitcoind'];

BitcoinWallet.DEFAULT_HISTORY_BLOCK_RANGE = 144; // one day
BitcoinWallet.DEFAULT_HISTORY_CONCURRENCY = 5;

BitcoinWallet.prototype._getApplicationDir = function() {
  var appPath = path.resolve(process.env.HOME, './.bwsv2');
  return appPath;
};

BitcoinWallet.prototype._setupDirectory = function(directory, callback) {
  fs.access(directory, function(err) {
    if (err && err.code === 'ENOENT') {
      return mkdirp(directory, callback);
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
    databasePath = path.resolve(appPath, './wallet-livenet.lmdb');
  } else if (this.node.network === bitcore.Networks.testnet) {
    if (this.node.network.regtestEnabled) {
      databasePath = path.resolve(appPath, './wallet-regtest.lmdb');
    } else {
      databasePath = path.resolve(appPath, './wallet-testnet3.lmdb');
    }
  } else {
    throw new TypeError('Unknown network: ' + this.node.network);
  }
  return databasePath;
};

BitcoinWallet.prototype._setupDatabase = function(callback) {
  var self = this;
  var dbPath = self._getDatabasePath();

  async.series([
    function(next) {
      self._setupDirectory(dbPath, next);
    }, function(next) {
      self.db = {};
      self.db.env = new lmdb.Env();
      self.db.env.open({
        path: dbPath,
        maxDbs: 10,
        mapSize: 268435456 * 4096,
        maxReaders: 126,
        noMetaSync: true,
        noSync: true
      });
      self.db.keys = self.db.env.openDbi({
        name: 'keys',
        create: true
      });
      self.db.txids = self.db.env.openDbi({
        name: 'txids',
        create: true
      });
      self.db.wallet = self.db.env.openDbi({
        name: 'wallet',
        create: true
      });
      self.db.txs = self.db.env.openDbi({
        name: 'txs',
        create: true
      });
      next();
    }
  ], callback);
};

BitcoinWallet.prototype._loadWalletData = function(callback) {
  var txn = this.db.env.beginTxn({readOnly: true});
  var buffer = txn.getBinary(this.db.wallet, models.Wallet.KEY.toString('hex'));
  if (!buffer) {
    // wallet is brand new
    // TODO validate that keys and txs is also empty
    var height = this.bitcoind.height;
    var blockHash = this.bitcoind.tiphash;
    this.walletData = models.Wallet.create({height: height, blockHash: new Buffer(blockHash, 'hex')});
  } else {
    this.walletData = models.Wallet.fromBuffer(buffer);
  }
  txn.abort();
  callback();
};

BitcoinWallet.prototype.start = function(callback) {
  var self = this;

  self.bitcoind = self.node.services.bitcoind;

  async.series([
    function(next) {
      var appPath = self._getApplicationDir();
      self._setupDirectory(appPath, next);
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

    self.bitcoind.on('tip', function() {
      if(!self.node.stopping) {
        self.sync();
      }
    });
    callback();
  });

};

BitcoinWallet.prototype.stop = function(callback) {
  if (this.db) {
    this.db.keys.close();
    this.db.wallet.close();
    this.db.txids.close();
    this.db.txs.close();
    this.db.env.close();
    setImmediate(callback);
  } else {
    setImmediate(callback);
  }
};

/**
 * This will insert txids into txn and update the balance on walletData from
 * the address deltas. Both txn and walletData do not modify the current wallet
 * reference, but the arguments passed into the function.

 * @param {Object} txn - Database transaction
 * @param {WalletData} walletData - The current wallet txids data structure
 * @param {Object} data
 * @param {Object} data.blockHeight - The block height of deltas
 * @param {String} data.address - The base58 encoded hex string
 * @param {String} data.deltas - The deltas for the address as returned from block handler
 * @param {Function} callback
 * @param {}
 */
BitcoinWallet.prototype._connectBlockAddressDeltas = function(txn, walletData, data, callback) {

  // Because it's possible to have false positives from the bloom filter, we need to
  // check that the address actually exists in the wallet before, and if it does not
  // we will continue along without making any modifications.
  var keyData = models.WalletKey({address: data.address});
  var keyDataKey = keyData.getKey();

  var buffer = txn.getBinary(this.db.keys, keyDataKey.toString('hex'));
  if (!buffer) {
    return callback();
  } else {
    for (var i = 0; i < data.deltas.length; i++) {
      var delta = data.deltas[i];
      var txid = models.WalletTxid.create(data.blockHeight, delta.blockIndex, delta.txid);
      txn.putBinary(this.db.txids, txid.getKey().toString('hex'), txid.getValue());
    }
    // TODO also adjust the balance on walletData
  }
  callback();
};

/**
 * This will commit any changes to txn and walletData to the database and update the
 * current wallet reference to this data.
 *
 * @param {Object} txn
 * @param {WalletData} walletData
 * @param {Block} block - The block being commited
 * @param {Function} callback
 */
BitcoinWallet.prototype._connectBlockCommit = function(txn, walletData, block, callback) {
  var self = this;

  // Update the latest status of the wallet
  walletData.blockHash = new Buffer(block.hash, 'hex');
  walletData.height = block.__height;

  txn.putBinary(this.db.wallet, models.Wallet.KEY.toString('hex'), walletData.toBuffer());

  txn.commit();

  this.db.env.sync(function(err) {
    if (err) {
      return callback(err);
    }
    self.walletData = walletData;
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
  var txn = this.db.env.beginTxn();

  async.each(Object.keys(addressDeltas), function(address, next) {
    self._connectBlockAddressDeltas(txn, walletData, {
      address: address,
      deltas: addressDeltas[address],
      blockHeight: block.__height,
    }, next);
  }, function(err) {
    if (err) {
      return callback(err);
    }
    self._connectBlockCommit(txn, walletData, block, callback);
  });
};

BitcoinWallet.prototype._disconnectTip = function(callback) {
  // TODO
  setImmediate(callback);
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
  if (self.syncing || self.node.stopping || !self.walletData) {
    return false;
  }

  self.syncing = true;

  var height;
  async.whilst(function() {
    if (self.node.stopping) {
      return false;
    }
    height = self.walletData.height;
    return height < self.bitcoind.height;
  }, function(done) {
    self._updateTip(height, done);
  }, function(err) {
    self.syncing = false;
    if (err) {
      Error.captureStackTrace(err);
      return self.emit('error', err);
    }
    if (!self.node.stopping) {
      self.emit('synced');
    }
  });

  return true;
};

BitcoinWallet.prototype._checkKeyImported = function(txn, key, callback) {
  var keyData = models.WalletKey(key);
  var keyDataKey = keyData.getKey();
  var buffer = txn.getBinary(this.db.keys, keyDataKey.toString('hex'));
  if (!buffer) {
    return callback();
  } else {
    txn.abort();
    return callback(new Error('Key already imported'));
  }
};

BitcoinWallet.prototype._wrapRPCError = function(errObj) {
  var err = new Error(errObj.message);
  err.code = errObj.code;
  return err;
};

BitcoinWallet.prototype._addKeyToWallet = function(txn, walletData, keyData, callback) {
  var self = this;

  var address = bitcore.Address(keyData.address, this.node.network);

  // TODO consider reorg at the same height by asserting that the block hash from the response
  // matches what is expected as our current block hash
  var query = {addresses: [keyData.address], start: 1, end: walletData.height};

  // TODO query in groups of block ranges to avoid JavaScript maximum string length errors
  this.bitcoind.client.getAddressDeltas(query, function(err, response) {
    if (err) {
      return callback(self._wrapRPCError(err));
    }

    // find the balance delta and new transactions
    var balance = 0;
    var result = response.result;
    for (var i = 0; i < result.length; i++) {
      var delta = result[i];
      balance += delta.satoshis;
      var txid = models.WalletTxid.create(delta.height, delta.blockindex, delta.txid);
      txn.putBinary(self.db.txids, txid.getKey().toString('hex'), txid.getValue());
    }

    // update bloom filter with new address and add the balance
    walletData.addressFilter.insert(address.hashBuffer);
    walletData.balance += balance;

    callback();
  });
};

BitcoinWallet.prototype._commitWalletKey = function(txn, walletData, keyData, callback) {
  var self = this;

  txn.putBinary(this.db.wallet, models.Wallet.KEY.toString('hex'), walletData.toBuffer());
  txn.putBinary(this.db.keys, keyData.getKey().toString('hex'), keyData.getValue());

  txn.commit();

  this.db.env.sync(function(err) {
    if (err) {
      return callback(err);
    }
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

  var txn = this.db.env.beginTxn();

  async.series([
    function(next) {
      self._checkKeyImported(txn, key, next);
    },
    function(next) {
      self._addKeyToWallet(txn, walletData, keyData, next);
    }
  ], function(err) {
    if (err) {
      self.syncing = false;
      return callback(err);
    }
    self._commitWalletKey(txn, walletData, keyData, function(err) {
      self.syncing = false;
      if (err) {
        return callback(err);
      }
      callback();
    });
  });
};

BitcoinWallet.prototype._validateStartAndEnd = function(options) {
  assert(bitcore.util.js.isNaturalNumber(options.start), '"start" is expected to be a natural number');
  assert(bitcore.util.js.isNaturalNumber(options.end), '"end" is expected to be a natural number');
  assert(options.start < options.end, '"start" is expected to be less than "end"');
  assert(options.end - options.start <= this.defaults.historyBlockRange,
         '"start" and "end" range exceeds maximum of ' + this.defaults.historyBlockRange);
  return options;
};

BitcoinWallet.prototype._checkTxidsQuery = function(options) {
  if (!options) {
    options = {};
  }
  options.height = options.height || this.bitcoind.height;
  options.index = options.index || 0;

  if (!options.limit) {
    options.limit = 10;
  } else if (options.limit > 500) {
    throw new Error('Limit exceeds maximum');
  }

  assert(bitcore.util.js.isNaturalNumber(options.height), '"height" is expected to be a natural number');
  assert(bitcore.util.js.isNaturalNumber(options.index), '"index" is expected to be a natural number');
  assert(bitcore.util.js.isNaturalNumber(options.limit), '"limit" is expected to be a natural number');
  assert(options.limit <= 500, '"limit" exceeds maximum');
  return options;
};



/**
 * Will get the latest transaction ids for the wallet.
 * @param options
 * @param options.height - Starting block height
 * @param options.index - Starting block index
 * @param options.limit - Total number of txids to return
 * @param options.buffers - Include results as a buffer
 */
BitcoinWallet.prototype.getWalletTxids = function(options, callback) {
  try {
    options = this._checkTxidsQuery(options);
  } catch(err) {
    return callback(err);
  }

  var txn = this.db.env.beginTxn({readOnly: true});
  var cursor = new lmdb.Cursor(txn, this.db.txids);

  var start = models.WalletTxid.create(options.height, options.index);
  var status = cursor.goToKey(start.getKey().toString('hex'));

  var txids = [];

  function iterator() {
    cursor.getCurrentBinary(function(key, value) {
      txids.push(value);

      var status = cursor.goToPrev();
      if (status && txids.length < options.limit) {
        // TODO make sure maximum call stack is not reached
        iterator();
      } else {
        done();
      }
    });
  }

  if (status) {
    iterator();
  } else {
    done();
  }

  function done() {
    cursor.close();
    txn.abort();

    var result = txids;
    if (!options.buffers) {
      result = txids.map(function(txid) {
        return txid.toString('hex');
      });
    }
    callback(null, result);
  }

};

BitcoinWallet.prototype._importTransaction = function(txn, txid, callback) {
  var self = this;
  this.bitcoind.getDetailedTransaction(txid.toString('hex'), function(err, transaction) {
    if (err) {
      return callback(err);
    }
    var tx = models.WalletTransaction(transaction);
    txn.putBinary(self.db.txs, tx.getKey().toString('hex'), tx.toBuffer());
    callback(null, tx);
  });
};

BitcoinWallet.prototype.getWalletTransactions = function(options, callback) {
  var self = this;
  if (!options) {
    options = {};
  }

  if (!options.start || !options.end) {
    options.end = this.bitcoind.height;
    options.start = options.end - this.defaults.historyBlockRange;
  }

  try {
    this._validateStartAndEnd(options);
  } catch(err) {
    return callback(err);
  }

  var start = models.WalletTxid.create(options.start, 0);
  var startKey = start.getKey().toString('hex');

  var end = models.WalletTxid.create(options.end, 0);
  var endKey = end.getKey().toString('hex');

  var txn = this.db.env.beginTxn();
  var cursor = new lmdb.Cursor(txn, this.db.txids);
  var status = cursor.goToKey(startKey);

  var txids = [];

  function iterator() {
    cursor.getCurrentBinary(function(key, value) {
      txids.push(value);

      var status = cursor.goToNext();
      if (status && key < endKey) {
        // TODO make sure maximum call stack is not reached
        iterator();
      } else {
        done();
      }
    });
  }

  if (status) {
    iterator();
  } else {
    done();
  }

  function done() {
    async.mapLimit(txids, self.defaults.historyConcurrency, function(txid, next) {
      var key = models.WalletTransaction.getKeyFromTxid(txid);

      var buffer = txn.getBinary(self.db.txs, key.toString('hex'));
      if (!buffer) {
        return self._importTransaction(txn, txid, next);
      }
      var tx = models.WalletTransaction.fromBuffer(buffer);
      next(null, tx);
    }, function(err, txs) {
      if (err) {
        return callback(err);
      }
      txn.commit();
      self.db.env.sync(function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, txs);
      });
    });
  }

};

BitcoinWallet.prototype.getAPIMethods = function() {
  var methods = [
    ['importWalletKey', this, this.importWalletKey, 1],
    ['getWalletTxids', this, this.getWalletTxids, 1],
    ['getWalletTransactions', this, this.getWalletTransactions, 1]
  ];
  return methods;
};

BitcoinWallet.prototype.getPublishEvents = function() {
  return [];
};

module.exports = BitcoinWallet;
