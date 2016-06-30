'use strict';

var assert = require('assert');
var async = require('async');
var BitcoinRPC = require('bitcoind-rpc');
var bitcore = require('bitcore-lib');
var _ = require('lodash');
var Block = bitcore.Block;
var BufferUtil = bitcore.util.buffer;

var db = require('./db');
var Config = require('./config');
var BlockHandler = require('./block-handler');
var models = require('./models');
var utils = require('./utils');

function WriterWorker(options) {
  this.stopping = false;
  this.syncing = false;
  this.blockHandler = null;
  this.walletData = null;

  // TODO this.log

  this.network = bitcore.Networks.get(options.network);
  assert(this.network, '"network" is an expected option, please specify "livenet", "testnet" or "regtest"');
  assert(options.bitcoinHeight, '"bitcoinHeight" is expected');
  assert(options.bitcoinHash, '"bitcoinHash" is expected');
  assert(options.clientsConfig && options.clientsConfig.length > 0, '"clientsConfig" is expected');
  this.bitcoinHeight = options.bitcoinHeight;
  this.bitcoinHash = options.bitcoinHash;
  this.clientsConfig = options.clientsConfig;
  this.config = new Config({
    network: this.network,
    path: options.path
  });

  this._initClients();
  this._initQueue(options);
}

WriterWorker.DEFAULT_MAX_WORK_QUEUE = 16;

WriterWorker.prototype._getClients = function() {
  var clients = [];
  for (var i = 0; i < this.clientsConfig.length; i++) {
    var config = this.clientsConfig[i];
    var remoteClient = new BitcoinRPC({
      protocol: config.rpcprotocol || 'http',
      host: config.rpchost || '127.0.0.1',
      port: config.rpcport,
      user: config.rpcuser,
      pass: config.rpcpassword,
      rejectUnauthorized: _.isUndefined(config.rpcstrict) ? true : config.rpcstrict
    });
    clients.push(remoteClient);
  }
  return clients;
};

WriterWorker.prototype._initClients = function() {
  var self = this;
  this._clients = this._getClients();
  this._clientsIndex = 0;
  Object.defineProperty(this, 'clients', {
    get: function() {
      var client = self._clients[self._clientsIndex];
      self._clientsIndex = (self._clientsIndex + 1) % self._clients.length;
      return client;
    },
    enumerable: true,
    configurable: false
  });
};

WriterWorker.prototype._tryAllClients = function(func, callback) {
  var self = this;
  var clientIndex = this._clientsIndex;
  var retry = function(done) {
    var client = self._clients[clientIndex];
    clientIndex = (clientIndex + 1) % self._clients.length;
    func(client, done);
  };
  async.retry({times: this._clients.length, interval: 1000}, retry, callback);
};

WriterWorker.prototype._initQueue = function(options) {
  var self = this;
  this.methodsMap = this._getMethodsMap();
  this.maxWorkQueue = options.maxWorkQueue || WriterWorker.DEFAULT_MAX_WORK_QUEUE;
  this.queue = async.priorityQueue(function(task, callback) {
    self._queueWorker(task, callback);
  }, 1);
  this._initProcessListener();
};

WriterWorker.prototype._loadWalletData = function(callback) {
  var txn = this.db.env.beginTxn({readOnly: true});
  var buffer = txn.getBinary(this.db.wallet, models.Wallet.KEY.toString('hex'));
  if (!buffer) {
    // wallet is brand new
    // TODO validate that addresses and txs is also empty
    var height = this.bitcoinHeight;
    var blockHash = this.bitcoinHash;
    this.walletData = models.Wallet.create({height: height, blockHash: new Buffer(blockHash, 'hex')});
  } else {
    this.walletData = models.Wallet.fromBuffer(buffer);
  }
  txn.abort();
  callback();
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
      self._loadWalletData(next);
    }
  ], function(err) {
    if (err) {
      return callback(err);
    }
    self.blockHandler = new BlockHandler({
      network: self.network,
      addressFilter: self.walletData.addressFilter
    });
    callback();
  });
};

WriterWorker.prototype.stop = function(callback) {
  this.stopping = true;
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
      args: 1
    },
    saveTransaction: {
      fn: this.saveTransaction,
      args: 1
    }
  };
};

WriterWorker.prototype._sendResponse = function(id, error, result) {
  process.send({
    id: id,
    error: error,
    result: result
  });
};

WriterWorker.prototype._queueWorker = function(task, next) {
  var self = this;
  if (this.methodsMap[task.method]) {
    var params = task.params;
    if (!params || !params.length) {
      params = [];
    }
    if (params.length !== this.methodsMap[task.method].args) {
      var error = {message: 'Expected ' + this.methodsMap[task.method].args + ' parameter(s)'};
      self._sendResponse(task.id, error);
      return next();
    }

    var callback = function(err, result) {
      var error = err ? {message: err.toString()} : null
      self._sendResponse(task.id, error, result);
      next();
    };

    params = params.concat(callback);
    this.methodsMap[task.method].fn.apply(this, params);
  } else {
    self._sendResponse(task.id, {message: 'Method Not Found'});
    next();
  }
};

WriterWorker.prototype._initProcessListener = function() {
  var self = this;
  process.on('message', function(msg) {
    var task = msg.task;
    var priority = msg.priority || 10;
    if (self.queue.length() >= self.maxWorkQueue) {
      return self._sendResponse(task.id, {
          message: 'Work queue depth exceeded'
      });
    }
    self.queue.push(task, priority);
  });
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
WriterWorker.prototype._connectBlockAddressDeltas = function(txn, walletData, data, callback) {

  // Because it's possible to have false positives from the bloom filter, we need to
  // check that the address actually exists in the wallet before, and if it does not
  // we will continue along without making any modifications.
  var keyData = models.WalletAddress({address: data.address});
  var keyDataKey = keyData.getKey();

  var buffer = txn.getBinary(this.db.addresses, keyDataKey.toString('hex'));
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
WriterWorker.prototype._connectBlockCommit = function(txn, walletData, block, callback) {
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
    console.info('Block ' + block.hash + ' connected to wallet at height ' + block.__height);
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
          return done(self._wrapRPCError(err));
        }
        done(null, response.result);
      });
    }, callback);
  } else {
    callback(null, blockArg);
  }
};

WriterWorker.prototype._getRawBlock = function(blockArg, callback) {
  var self = this;
  function queryBlock(err, blockhash) {
    if (err) {
      return callback(err);
    }
    self._tryAllClients(function(client, done) {
      client.getBlock(blockhash, false, function(err, response) {
        if (err) {
          return done(self._wrapRPCError(err));
        }
        var buffer = new Buffer(response.result, 'hex');
        done(null, buffer);
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
  self._getRawBlock(height + 1, function(err, blockBuffer) {
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
        // TODO send event?
        callback();
      });
    } else {
      // This block doesn't progress the current tip, so we'll attempt
      // to rewind the chain to the common ancestor of the block and
      // then we can resume syncing.
      console.warn('Reorg detected! Current tip: ' + self.walletData.blockHash.toString('hex'));
      self._disconnectTip(function(err) {
        if (err) {
          return callback(err);
        }
        console.warn('Disconnected current tip. New tip is ' + self.walletData.blockHash.toString('hex'));
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
  assert(options.bitcoinHeight, '"bitcoinHeight" is expected');
  assert(options.bitcoinHash, '"bitcoinHash" is expected');
  this.bitcoinHeight = options.bitcoinHeight;
  this.bitcoinHash = options.bitcoinHash;

  var self = this;
  if (self.syncing || self.stopping || !self.walletData) {
    return false;
  }

  self.syncing = true;

  var height;
  async.whilst(function() {
    if (self.stopping) {
      return false;
    }
    height = self.walletData.height;
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

WriterWorker.prototype._wrapRPCError = function(errObj) {
  var err = new Error(errObj.message);
  err.code = errObj.code;
  return err;
};

WriterWorker.prototype._addAddressesToWallet = function(txn, walletData, walletAddresses, callback) {
  var self = this;

  var addresses = walletAddresses.map(function(a) {
    return a.address.toString();
  });

  // split the large query into smaller queries as it's possible
  // to reach a maximum string length in the responses
  var ranges = utils.splitRange(1, walletData.height, 25000);
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
        return next(self._wrapRPCError(err));
      }

      // find the balance delta and new transactions
      var balanceDelta = 0;
      var result = response.result;
      for (var i = 0; i < result.length; i++) {
        var delta = result[i];
        balanceDelta += delta.satoshis;
        var txid = models.WalletTxid.create(delta.height, delta.blockindex, delta.txid);
        txn.putBinary(self.db.txids, txid.getKey().toString('hex'), txid.getValue());
      }

      // update bloom filter with new address and add the balance
      for (var j = 0; j < walletAddresses.length; j++) {
        walletData.addressFilter.insert(walletAddresses[j].address.hashBuffer);
      }
      walletData.balance += balanceDelta;

      next();
    });

  }, callback);

};

WriterWorker.prototype._commitWalletAddresses = function(txn, walletData, walletAddresses, callback) {
  var self = this;

  for (var i = 0; i < walletAddresses.length; i++) {
    var address = walletAddresses[i];
    txn.putBinary(this.db.addresses, address.getKey().toString('hex'), address.getValue());
  }

  txn.putBinary(this.db.wallet, models.Wallet.KEY.toString('hex'), walletData.toBuffer());

  txn.commit();

  this.db.env.sync(function(err) {
    if (err) {
      return callback(err);
    }
    self.walletData = walletData;
    callback();
  });
};


WriterWorker.prototype._filterNewAddresses = function(txn, walletAddresses) {
  var self = this;
  var newAddresses = walletAddresses.filter(function(address) {
    var key = address.getKey();
    var buffer = txn.getBinary(self.db.addresses, key.toString('hex'));
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
WriterWorker.prototype.importWalletAddresses = function(addresses, callback) {
  var self = this;
  if (self.syncing) {
    return callback(new Error('Sync or import in progress'));
  }
  self.syncing = true;

  var walletData = self.walletData.clone();

  var walletAddresses = addresses.map(function(address) {
    return models.WalletAddress({address: address});
  });

  var txn = this.db.env.beginTxn();

  var newAddresses = self._filterNewAddresses(txn, walletAddresses);

  self._addAddressesToWallet(txn, walletData, newAddresses, function(err) {
    if (err) {
      self.syncing = false;
      return callback(err);
    }
    self._commitWalletAddresses(txn, walletData, newAddresses, function(err) {
      self.syncing = false;
      if (err) {
        return callback(err);
      }
      callback(null, newAddresses);
    });

  });

};

WriterWorker.prototype.saveTransaction = function(transaction, callback) {
  var self = this;
  var walletTransaction = models.WalletTransaction(transaction);
  var txn = this.db.env.beginTxn();

  txn.putBinary(self.db.txs, walletTransaction.getKey().toString('hex'), walletTransaction.toBuffer());
  txn.commit();
  this.db.env.sync(function(err) {
    if (err) {
      return callback(err);
    }
    callback();
  });
};

if (require.main === module) {
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
