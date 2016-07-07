'use strict';

var net = require('net');
var assert = require('assert');
var async = require('async');
var bitcore = require('bitcore-lib');
var _ = require('lodash');
var lmdb = require('node-lmdb');

var db = require('./db');
var Config = require('./config');
var BlockFilter = require('./block-filter');
var models = require('./models');
var utils = require('./utils');

function WriterWorker(options) {
  this.db = null;
  this.stopping = false;
  this.syncing = false;
  this.blockFilter = null;
  this.walletBlock = null;
  this._server = null;
  this._initOptions(options);
  this._initClients();
  this._initQueue(options);
}

WriterWorker.DEFAULT_MAX_WORK_QUEUE = 16;

WriterWorker.prototype._initOptions = function(options) {
  this.network = bitcore.Networks.get(options.network);
  assert(this.network, '"network" is an expected option, please specify "livenet", "testnet" or "regtest"');
  assert(options.bitcoinHeight >= 0, '"bitcoinHeight" is expected');
  assert(options.bitcoinHash, '"bitcoinHash" is expected');
  assert(options.clientsConfig && options.clientsConfig.length > 0, '"clientsConfig" is expected');
  assert(options.listen, '"listen" is expected');
  this.listen = options.listen;
  this.bitcoinHeight = options.bitcoinHeight;
  this.bitcoinHash = options.bitcoinHash;
  this.clientsConfig = options.clientsConfig;
  this.config = new Config({
    network: options.network,
    path: options.path
  });
};

WriterWorker.prototype._initClients = function() {
  var clients = utils.getClients(this.clientsConfig);
  utils.setClients(this, clients);
};

WriterWorker.prototype._tryAllClients = function(func, callback) {
  utils.tryAllClients(this, func, callback);
};

WriterWorker.prototype._initQueue = function(options) {
  var self = this;
  this.methodsMap = this._getMethodsMap();
  this.maxWorkQueue = options.maxWorkQueue || WriterWorker.DEFAULT_MAX_WORK_QUEUE;
  this.queue = async.priorityQueue(function(task, callback) {
    self._queueWorkerIterator(task, callback);
  }, 1);
};

WriterWorker.prototype._loadLatestWalletBlock = function(callback) {
  var self = this;

  var txn = this.db.env.beginTxn({readOnly: true});

  var cursor = new lmdb.Cursor(txn, this.db.blocks);
  var found = cursor.goToLast();
  if (!found) {
    // wallet is brand new
    var height = this.bitcoinHeight;
    var blockHash = this.bitcoinHash;
    this.walletBlock = models.WalletBlock.create(height, blockHash);

    callback();

  } else {
    cursor.getCurrentBinary(function(key, value) {
      self.walletBlock = models.WalletBlock.fromBuffer(key, value);

      cursor.close();
      txn.abort();

      callback();
    });
  }

};

WriterWorker.prototype._setupDatabase = function(callback) {
  var self = this;
  var dbPath = self.config.getDatabasePath();

  async.series([
    function(next) {
      utils.setupDirectory(dbPath, next);
    }, function(next) {
      self.db = db.open(dbPath);
      next();
    }
  ], callback);
};

WriterWorker.prototype._startListener = function(callback) {
  var self = this;

  // TODO handle EADDRINUSE
  this._server = net.createServer(function(socket) {
    var buffer = '';

    socket.on('data', function(data) {

      buffer += data.toString('utf8');

      var msg;
      try {
        msg = JSON.parse(buffer);
        buffer = new Buffer(new Array(0));
      } catch(err) {
        return;
      }

      var task = msg.task;
      task.socket = socket;

      var priority = msg.priority || 10;

      if (self.queue.length() >= self.maxWorkQueue) {
        return self._sendResponse(socket, task.id, {
          message: 'Work queue depth exceeded'
        });
      }

      self.queue.push(task, priority);
    });
  });

  this._server.on('error', function(err) {
    throw err;
  });

  this._server.listen(self.listen, function() {
    callback();
  });
};

WriterWorker.prototype.start = function(callback) {
  var self = this;

  async.series([
    function(next) {
      var appPath = self.config.getApplicationPath();
      utils.setupDirectory(appPath, next);
    },
    function(next) {
      self._setupDatabase(next);
    },
    function(next) {
      self._loadLatestWalletBlock(next);
    },
    function(next) {
      self._startListener(next);
    }
  ], function(err) {
    if (err) {
      return callback(err);
    }

    self.blockFilter = new BlockFilter({
      network: self.network,
      addressFilter: self.walletBlock.addressFilter
    });

    callback();
  });
};

WriterWorker.prototype.stop = function(callback) {
  this.stopping = true;

  if (this._server) {
    this._server.close();
  }

  if (this.db) {
    db.close(this.db);
    setImmediate(callback);
  } else {
    setImmediate(callback);
  }
};

WriterWorker.prototype._getMethodsMap = function() {
  return {
    sync: {
      fn: this.sync,
      args: 1
    },
    importWalletAddresses: {
      fn: this.importWalletAddresses,
      args: 2
    },
    saveTransaction: {
      fn: this.saveTransaction,
      args: 2
    },
    createWallet: {
      fn: this.createWallet,
      args: 1
    }
  };
};

WriterWorker.prototype._sendResponse = function(socket, id, error, result) {
  var msg = JSON.stringify({
    id: id,
    error: error,
    result: result
  });
  socket.write(msg, 'utf8');
};

WriterWorker.prototype._queueWorkerIterator = function(task, next) {
  var self = this;

  if (this.methodsMap[task.method]) {
    var params = task.params;

    if (!params || !params.length) {
      params = [];
    }

    if (params.length !== this.methodsMap[task.method].args) {
      var error = {message: 'Expected ' + this.methodsMap[task.method].args + ' parameter(s)'};
      self._sendResponse(task.socket, task.id, error);
      return next();
    }

    var callback = function(err, result) {
      var error = err ? {message: err.toString()} : null
      self._sendResponse(task.socket, task.id, error, result);
      next();
    };

    params = params.concat(callback);
    this.methodsMap[task.method].fn.apply(this, params);
  } else {
    self._sendResponse(task.socket, task.id, {message: 'Method Not Found'});
    next();
  }
};

/**
 * This will insert txids into txn. Does not modify the current wallet
 * reference, but the arguments passed into the function.

 * @param {Object} txn - Database transaction
 * @param {Object} wallets - An object to hold updated wallets
 * @param {Object} data
 * @param {Object} data.blockHeight - The block height of deltas
 * @param {String} data.address - The base58 encoded hex string
 * @param {String} data.deltas - The deltas for the address as returned from block handler
 * @param {Function} callback
 * @param {}
 */
WriterWorker.prototype._connectBlockAddressDeltas = function(txn, wallets, data, callback) {
  var self = this;

  // Because it's possible to have false positives from the bloom filter, we need to
  // check that the address actually exists in the wallet before, and if it does not
  // we will continue along without making any modifications.
  var key = models.WalletAddressMap.getKey(data.address, 'hex', this.network);

  var buffer = txn.getBinary(this.db.addressesMap, key);

  if (!buffer) {
    return callback();
  } else {
    var walletIds = utils.splitBuffer(buffer, 32);
    walletIds.forEach(function(walletId) {

      // update txids
      var satoshisDelta = 0;
      for (var i = 0; i < data.deltas.length; i++) {
        var delta = data.deltas[i];
        var txid = models.WalletTxid.create(walletId, data.blockHeight, delta.blockIndex, delta.txid);
        txn.putBinary(self.db.txids, txid.getKey('hex'), txid.getValue());
        satoshisDelta += delta.satoshis;
      }

      // update wallet balance
      var walletKey = walletId.toString('hex');
      if (!wallets[walletKey]) {
        var walletBuffer = txn.getBinary(self.db.wallets, walletId.toString('hex'));
        var wallet = models.Wallet.fromBuffer(walletBuffer);
        wallets[walletKey] = wallet;
      }
      wallets[walletKey].addBalance(satoshisDelta);

      // TODO keep track of utxos

    });
  }

  callback();
};


/**
 * This will commit any changes to the database and update the
 * current wallet reference to this data.
 *
 * @param {Object} txn - Transaction with changes
 * @param {Object} wallets - An object with updated wallets
 * @param {Block} block - The block being commited
 * @param {Function} callback
 */
WriterWorker.prototype._connectBlockCommit = function(txn, wallets, block, callback) {
  var self = this;

  // Prevent in memory modifications until we know the changes
  // have been persisted to disk, so that the method can be reattempted without
  // causing state issues
  var walletBlock = this.walletBlock.clone();

  // Update the latest status of the blocks
  walletBlock.blockHash = new Buffer(block.hash, 'hex');
  walletBlock.height = block.height;

  txn.putBinary(this.db.blocks, walletBlock.getKey('hex'), walletBlock.getValue());

  // Update all of the wallets
  for (var key in wallets) {
    var wallet = wallets[key];
    txn.putBinary(self.db.wallets, wallet.getKey('hex'), wallet.getValue());
  }

  txn.commit();

  this.db.env.sync(function(err) {
    if (err) {
      return callback(err);
    }

    self.walletBlock = walletBlock;
    self.blockFilter = new BlockFilter({
      network: self.network,
      addressFilter: self.walletBlock.addressFilter
    });

    console.info('Block ' + block.hash + ' connected to wallet at height ' + block.height);
    callback();
  });
};

/**
 * This will take a block and parse it for addresses that apply to this wallet
 * and update the database with the new transactions.
 * @param {Block} block
 * @param {Function} callback
 */
WriterWorker.prototype._connectBlock = function(block, callback) {
  var self = this;

  // This will get all relevant changes that apply to addresses in this wallet
  // using a bloom filter. The results will include the matching txids.
  var addressDeltas = this.blockFilter.buildAddressDeltaList(block);

  var txn = this.db.env.beginTxn();

  var wallets = {};

  async.each(Object.keys(addressDeltas), function(address, next) {
    self._connectBlockAddressDeltas(txn, wallets, {
      address: address,
      deltas: addressDeltas[address],
      blockHeight: block.height,
    }, next);
  }, function(err) {
    if (err) {
      return callback(err);
    }
    self._connectBlockCommit(txn, wallets, block, callback);
  });
};

WriterWorker.prototype._disconnectTip = function(callback) {
  // TODO
  setImmediate(callback);
};

WriterWorker.prototype._maybeGetBlockHash = function(blockArg, callback) {
  var self = this;

  if (_.isNumber(blockArg) || (blockArg.length < 40 && /^[0-9]+$/.test(blockArg))) {
    self._tryAllClients(function(client, done) {
      client.getBlockHash(blockArg, function(err, response) {
        if (err) {
          return done(utils.wrapRPCError(err));
        }
        done(null, response.result);
      });
    }, callback);
  } else {
    callback(null, blockArg);
  }
};

WriterWorker.prototype._getBlockDeltas = function(blockArg, callback) {
  var self = this;

  function queryBlock(err, blockhash) {
    if (err) {
      return callback(err);
    }

    self._tryAllClients(function(client, done) {
      client.getBlockDeltas(blockhash, function(err, response) {
        if (err) {
          return done(utils.wrapRPCError(err));
        }

        done(null, response.result);
      });
    }, callback);
  }
  self._maybeGetBlockHash(blockArg, queryBlock);
};

/**
 * This will either add the next block to the wallet or will remove the current
 * block tip in the event of a reorganization.
 * @param {Number} height - The current height
 * @param {Function} callback
 */
WriterWorker.prototype._updateTip = function(height, callback) {
  var self = this;

  self._getBlockDeltas(height + 1, function(err, blockDeltas) {
    if (err) {
      return callback(err);
    }

    var prevHash = blockDeltas.previousblockhash;

    if (prevHash === self.walletBlock.blockHash.toString('hex')) {

      // This block appends to the current chain tip and we can
      // immediately add it to the chain and create indexes.
      self._connectBlock(blockDeltas, function(err) {
        if (err) {
          return callback(err);
        }
        // TODO send event?
        callback();
      });
    } else {
      // This block doesn't progress the current tip, so we'll attempt
      // to rewind the chain to the common ancestor of the block and
      // then we can resume syncing.
      console.warn('Reorg detected! Current tip: ' + self.walletBlock.blockHash.toString('hex'));
      self._disconnectTip(function(err) {
        if (err) {
          return callback(err);
        }
        console.warn('Disconnected current tip. New tip is ' + self.walletBlock.blockHash.toString('hex'));
        callback();
      });
    }
  });
};


/**
 * This function will continously update the block tip of the chain until it matches
 * the bitcoin height.
 */
WriterWorker.prototype.sync = function(options, callback) {

  // Update the current state of bitcoind chain
  assert(options.bitcoinHeight >= 0, '"bitcoinHeight" is expected');
  assert(options.bitcoinHash, '"bitcoinHash" is expected');
  this.bitcoinHeight = options.bitcoinHeight;
  this.bitcoinHash = options.bitcoinHash;

  var self = this;
  if (self.syncing || self.stopping || !self.walletBlock) {
    return false;
  }

  self.syncing = true;

  var height;
  async.whilst(function() {
    if (self.stopping) {
      return false;
    }
    height = self.walletBlock.height;
    return height < self.bitcoinHeight;
  }, function(done) {
    self._updateTip(height, done);
  }, function(err) {
    self.syncing = false;
    if (err) {
      return callback(err);
    }
    callback();
  });

  return true;
};

/* jshint maxparams:7 */
WriterWorker.prototype._addAddressesToWallet = function(txn, walletBlock, walletId, wallet, newAddresses, callback) {
  var self = this;

  var addresses = newAddresses.map(function(a) {
    return a.address.toString();
  });

  // split the large query into smaller queries as it's possible
  // to reach a maximum string length in the responses
  var rangeMax = Math.max(walletBlock.height, 2);
  var ranges = utils.splitRange(1, rangeMax, 25000);
  var queries = [];
  for (var i = 0; i < ranges.length; i++) {
    queries.push({
      addresses: addresses,
      start: ranges[i][0],
      end: ranges[i][1]
    });
  }

  async.eachSeries(queries, function(query, next) {
    // TODO consider reorg at the same height by asserting that the block hash from the response
    // matches what is expected as our current block hash
    self.clients.getAddressDeltas(query, function(err, response) {
      if (err) {
        return next(utils.wrapRPCError(err));
      }

      // find the balance delta and new transactions
      var balanceDelta = 0;
      var result = response.result;
      for (var i = 0; i < result.length; i++) {
        var delta = result[i];
        balanceDelta += delta.satoshis;
        var txid = models.WalletTxid.create(walletId, delta.height, delta.blockindex, delta.txid);
        txn.putBinary(self.db.txids, txid.getKey().toString('hex'), txid.getValue());
      }

      // update bloom filters with new address
      for (var j = 0; j < newAddresses.length; j++) {
        var hashBuffer = newAddresses[j].address.hashBuffer;
        walletBlock.addressFilter.insert(hashBuffer);
        wallet.addressFilter.insert(hashBuffer);
      }

      // update wallet balance
      wallet.balance += balanceDelta;

      next();
    });

  }, callback);

};

/* jshint maxparams:7 */
WriterWorker.prototype._commitWalletAddresses = function(txn, walletBlock, walletId, wallet, newAddresses, callback) {
  /* jshint maxstatements:20 */

  var self = this;

  for (var i = 0; i < newAddresses.length; i++) {

    // Update the address
    var walletAddress = newAddresses[i];
    txn.putBinary(this.db.addresses, walletAddress.getKey('hex'), walletAddress.getValue());

    // Update the address map
    var key = models.WalletAddressMap.getKey(walletAddress.address, 'hex', this.network);
    var value = txn.getBinary(this.db.addressesMap, key);
    var addressMap;
    if (value) {
      addressMap = models.WalletAddressMap.fromBuffer(key, value, this.network);
      addressMap.insert(walletId);
    } else {
      addressMap = models.WalletAddressMap.create(walletAddress.address, [walletId], this.network);
    }
    txn.putBinary(this.db.addressesMap, addressMap.getKey('hex'), addressMap.getValue());
  }

  // Update the wallet
  txn.putBinary(this.db.wallets, wallet.getKey('hex'), wallet.getValue());

  // Update the wallet block
  txn.putBinary(this.db.blocks, walletBlock.getKey('hex'), walletBlock.getValue());

  // Commit the changes
  txn.commit();
  this.db.env.sync(function(err) {
    if (err) {
      return callback(err);
    }
    self.walletBlock = walletBlock;
    callback();
  });
};


WriterWorker.prototype._filterNewAddresses = function(txn, walletAddresses) {
  var self = this;
  var newAddresses = walletAddresses.filter(function(address) {
    var buffer = txn.getBinary(self.db.addresses, address.getKey('hex'));
    if (!buffer) {
      return true;
    } else {
      return false;
    }
  });
  return newAddresses;
};

/**
 * Will import an address and key pair into the wallet and will keep track
 * of the balance and transactions.
 * @param {Array} addresses - Array of base58 encoded addresses
 */
WriterWorker.prototype.importWalletAddresses = function(walletId, addresses, callback) {
  var self = this;
  if (self.syncing) {
    return callback(new Error('Sync or import in progress'));
  }
  self.syncing = true;

  var txn = this.db.env.beginTxn();

  // Prevent in memory modifications until we know the changes
  // have been persisted to disk.
  var walletBlock = this.walletBlock.clone();

  var buffer = txn.getBinary(this.db.wallets, walletId);
  if (!buffer) {
    return callback(new Buffer('Wallet does not exist'));
  }
  var wallet = models.Wallet.fromBuffer(buffer);

  var walletAddresses = addresses.map(function(address) {
    return models.WalletAddress(walletId, address);
  });

  var newAddresses = self._filterNewAddresses(txn, walletAddresses);

  self._addAddressesToWallet(txn, walletBlock, walletId, wallet, newAddresses, function(err) {
    if (err) {
      self.syncing = false;
      return callback(err);
    }

    self._commitWalletAddresses(txn, walletBlock, walletId, wallet, newAddresses, function(err) {
      self.syncing = false;
      if (err) {
        return callback(err);
      }
      callback(null, newAddresses);
    });

  });

};

/**
 * Saves a transaction to the database
 *
 * @param {Object} transaction - The transaction object (response from verbose getrawtransaction)
 * @param {Function} callback
 */
WriterWorker.prototype.saveTransaction = function(walletId, transaction, callback) {
  var self = this;
  var walletTransaction = models.WalletTransaction.create(walletId, transaction);
  var txn = this.db.env.beginTxn();
  var value = walletTransaction.getValue();
  txn.putBinary(self.db.txs, walletTransaction.getKey('hex'), value);
  txn.commit();

  this.db.env.sync(function(err) {
    if (err) {
      return callback(err);
    }
    callback();
  });
};

/**
 * Creates a new wallet by walletId. If an existing wallet exists with the walletId
 * the existing wallet will be returned as the response.
 *
 * @param {Object} walletObj - Object representing the wallet
 * @param {Function} callback
 */
WriterWorker.prototype.createWallet = function(walletId, callback) {
  var wallet = models.Wallet({id: walletId});
  var txn = this.db.env.beginTxn();

  var key = wallet.getKey('hex');
  var buffer = txn.getBinary(this.db.wallets, key);
  if (buffer) {
    txn.abort();
    return callback();
  } else {
    txn.putBinary(this.db.wallets, key, wallet.getValue());
    txn.commit();
  }

  this.db.env.sync(function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, walletId);
  });
};

if (require.main === module) {

  process.title = 'walletd-writer';

  var options = JSON.parse(process.argv[2]);
  var worker = new WriterWorker(options);
  worker.start(function(err) {
    if (err) {
      throw err;
    }
    process.send('ready');
  });
  process.on('SIGINT', function() {
    worker.stop(function(err) {
      if (err) {
        throw err;
      }
      process.exit(0);
    });
  });
}

module.exports = WriterWorker;
