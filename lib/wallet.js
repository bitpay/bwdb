'use strict';

var assert = require('assert');
var Writable = require('stream').Writable;
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var async = require('async');
var bitcore = require('bitcore-lib');
var Block = bitcore.Block;
var BufferUtil = bitcore.util.buffer;
var bodyParser = require('body-parser');
var compression = require('compression');
var lmdb = require('node-lmdb');
var morgan = require('morgan');

var models = require('./models');
var utils = require('./utils');
var BlockHandler = require('./block-handler');
var Config = require('./config');

/**
 * A bitcore service for keeping a wallet with many addresses synchronized with the bitcoin
 * block chain. It will handle importing new addresses after there has already been
 * partial sycroniziation, and will watch the wallet's addresses for changes and persist this
 * data for quick retrieval.
 *
 * @param {Object} options
 * @param {Node} options.node - The bitcore node instance that this service is running
 */
function Wallet(options) {
  EventEmitter.call(this);
  this.node = options.node;
  this.log = this.node.log;
  this.bitcoind = null;
  this.db = null;
  this.walletData = null;
  this.syncing = false;
  this.blockHandler = null;
  this.defaults = {
    historyBlockRange: options.historyBlockRange || Wallet.DEFAULT_HISTORY_BLOCK_RANGE,
    historyConcurrency: options.historyConcurrency || Wallet.DEFAULT_HISTORY_CONCURRENCY
  };
  this.config = new Config({
    network: this.node.network,
    path: options.path
  });
  if (options.routePrefix) {
    this.routePrefix = options.routePrefix;
  } else {
    this.routePrefix = 'wallet';
  }
}
inherits(Wallet, EventEmitter);

Wallet.dependencies = ['bitcoind'];

Wallet.DEFAULT_HISTORY_BLOCK_RANGE = 144; // one day
Wallet.DEFAULT_HISTORY_CONCURRENCY = 5;

Wallet.prototype._setupDatabase = function(callback) {
  var self = this;
  var dbPath = self.config.getDatabasePath();

  async.series([
    function(next) {
      utils.setupDirectory(dbPath, next);
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
      self.db.addresses = self.db.env.openDbi({
        name: 'addresses',
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

Wallet.prototype._loadWalletData = function(callback) {
  var txn = this.db.env.beginTxn({readOnly: true});
  var buffer = txn.getBinary(this.db.wallet, models.Wallet.KEY.toString('hex'));
  if (!buffer) {
    // wallet is brand new
    // TODO validate that addresses and txs is also empty
    var height = this.bitcoind.height;
    var blockHash = this.bitcoind.tiphash;
    this.walletData = models.Wallet.create({height: height, blockHash: new Buffer(blockHash, 'hex')});
  } else {
    this.walletData = models.Wallet.fromBuffer(buffer);
  }
  txn.abort();
  callback();
};

Wallet.prototype.start = function(callback) {
  var self = this;

  self.bitcoind = self.node.services.bitcoind;

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

Wallet.prototype.stop = function(callback) {
  if (this.db) {
    this.db.addresses.close();
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
Wallet.prototype._connectBlockAddressDeltas = function(txn, walletData, data, callback) {

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
Wallet.prototype._connectBlockCommit = function(txn, walletData, block, callback) {
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
Wallet.prototype._connectBlock = function(block, callback) {
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

Wallet.prototype._disconnectTip = function(callback) {
  // TODO
  setImmediate(callback);
};

/**
 * This will either add the next block to the wallet or will remove the current
 * block tip in the event of a reorganization.
 * @param {Number} height - The current height
 * @param {Function} callback
 */
Wallet.prototype._updateTip = function(height, callback) {
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
Wallet.prototype.sync = function() {
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

Wallet.prototype._filterNewAddresses = function(txn, walletAddresses) {
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

Wallet.prototype._wrapRPCError = function(errObj) {
  var err = new Error(errObj.message);
  err.code = errObj.code;
  return err;
};

Wallet.prototype._addAddressesToWallet = function(txn, walletData, walletAddresses, callback) {
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
    self.bitcoind.client.getAddressDeltas(query, function(err, response) {
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

Wallet.prototype._commitWalletAddresses = function(txn, walletData, walletAddresses, callback) {
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

/**
 * Will import an address and key pair into the wallet and will keep track
 * of the balance and transactions.
 * @param {Array} addresses - Array of base58 encoded addresses
 */
Wallet.prototype.importWalletAddresses = function(addresses, callback) {
  var self = this;
  if (self.syncing) {
    // TODO possibly add to queue or wait instead of giving back an error
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

Wallet.prototype._validateStartAndEnd = function(options) {
  assert(bitcore.util.js.isNaturalNumber(options.start), '"start" is expected to be a natural number');
  assert(bitcore.util.js.isNaturalNumber(options.end), '"end" is expected to be a natural number');
  assert(options.start < options.end, '"start" is expected to be less than "end"');
  assert(options.end - options.start <= this.defaults.historyBlockRange,
         '"start" and "end" range exceeds maximum of ' + this.defaults.historyBlockRange);
  return options;
};

Wallet.prototype._checkTxidsQuery = function(options) {
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

Wallet.prototype._getLatestTxids = function(txn, options, callback) {
  var txids = [];

  try {
    options = this._checkTxidsQuery(options);
  } catch(err) {
    return callback(err);
  }

  var cursor = new lmdb.Cursor(txn, this.db.txids);

  var start = models.WalletTxid.create(options.height, options.index);
  var found = cursor.goToRange(start.getKey().toString('hex'));
  if (!found) {
    found = cursor.goToPrev();
  }

  function iterator() {
    cursor.getCurrentBinary(function(key, value) {
      txids.push(value);

      var prevFound = cursor.goToPrev();
      if (prevFound && txids.length < options.limit) {
        // TODO make sure maximum call stack is not reached
        iterator();
      } else {
        cursor.close();
        callback(null, txids);
      }
    });
  }

  if (found) {
    iterator();
  } else {
    cursor.close();
    callback(null, txids);
  }


};

/**
 * Will get the latest transaction ids for the wallet.
 * @param options
 * @param options.height - Starting block height
 * @param options.index - Starting block index
 * @param options.limit - Total number of txids to return
 * @param options.buffers - Include results as a buffer
 */
Wallet.prototype.getWalletTxids = function(options, callback) {
  var txn = this.db.env.beginTxn({readOnly: true});

  this._getLatestTxids(txn, options, function(err, txids) {
    txn.abort();
    if (err) {
      return callback(err);
    }

    var result = txids;
    if (!options.buffers) {
      result = txids.map(function(txid) {
        return txid.toString('hex');
      });
    }
    callback(null, result);
  });

};

Wallet.prototype._importTransaction = function(txn, txid, callback) {
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

Wallet.prototype.getWalletTransactions = function(options, callback) {
  var self = this;
  var txn = this.db.env.beginTxn();

  this._getLatestTxids(txn, options, function(err, txids) {
    async.mapLimit(txids, self.defaults.historyConcurrency, function(txid, next) {
      var key = models.WalletTransaction.getKeyFromTxid(txid);
      var buffer = txn.getBinary(self.db.txs, key.toString('hex'));
      if (!buffer) {
        self._importTransaction(txn, txid, next);
      } else {
        var tx = models.WalletTransaction.fromBuffer(buffer);
        next(null, tx);
      }
    }, function(err, txs) {
      if (err) {
        txn.abort();
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
  });
};

Wallet.prototype.getAPIMethods = function() {
  var methods = [
    ['importWalletAddresses', this, this.importWalletAddresses, 1],
    ['getWalletTxids', this, this.getWalletTxids, 1],
    ['getWalletTransactions', this, this.getWalletTransactions, 1]
  ];
  return methods;
};


Wallet.prototype.createLogInfoStream = function() {
  var self = this;

  function Log(options) {
    Writable.call(this, options);
  }
  inherits(Log, Writable);

  Log.prototype._write = function (chunk, enc, callback) {
    self.node.log.info(chunk.slice(0, chunk.length - 1)); // remove new line and pass to logger
    callback();
  };
  var stream = new Log();

  return stream;
};

Wallet.prototype.getRoutePrefix = function() {
  return this.routePrefix;
};

Wallet.prototype.getRemoteAddress = function(req) {
  if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }
  return req.socket.remoteAddress;
};

Wallet.prototype._sendError = function (err, res) {
  if (err.statusCode)  {
    res.status(err.statusCode).send(err.message);
  } else {
    this.log.error(err.stack);
    res.status(503).send(err.message);
  }
};

Wallet.prototype._checkAddresses = function(req, res, next) {
  var self = this;
  var addresses = [];

  if (!req.body.addresses || !req.body.addresses.length || !Array.isArray(req.body.addresses)) {
    return self._sendError({
      message: 'Addresses param is expected',
      statusCode: 400
    }, res);
  }

  for (var i = 0; i < req.body.addresses.length; i++) {
    var address;
    try {
      address = new bitcore.Address(req.body.addresses[i], this.node.network);
    } catch(e) {
      return self._sendError({
        message: 'Invalid address: ' + e.message,
        statusCode: 400
      }, res);
    }
    addresses.push(address);
  }

  req.addresses = addresses;
  next();
};

Wallet.prototype._checkAddress = function(req, res, next) {
  var self = this;
  var address;
  var addressStr;
  if (req.body.address) {
    addressStr = req.body.address;
  } else {
    addressStr = req.params.address;
  }

  if(!addressStr) {
    return self._sendError({
      message: 'Address param is expected',
      statusCode: 400
    }, res);
  }

  try {
    address = new bitcore.Address(addressStr, this.node.network);
  } catch(e) {
    return self._sendError({
      message: 'Invalid address: ' + e.message,
      statusCode: 400
    }, res);
  }

  req.address = address;
  next();
};

Wallet.prototype.setupRoutes = function(app) {
  var self = this;

  //Setup logging
  morgan.token('remote-forward-addr', function(req){
    return self.getRemoteAddress(req);
  });
  var logFormat = ':remote-forward-addr ":method :url" :status :res[content-length] :response-time ":user-agent" ';
  var logStream = this.createLogInfoStream();
  app.use(morgan(logFormat, {stream: logStream}));

  //Enable compression
  app.use(compression());

  //Enable urlencoded data
  app.use(bodyParser.urlencoded({extended: true}));

  //Enable CORS
  app.use(function(req, res, next) {

    res.header('access-control-allow-origin', '*');
    res.header('access-control-allow-methods', 'GET, HEAD, PUT, POST, OPTIONS');
    var allowed = [
      'origin',
      'x-requested-with',
      'content-type',
      'accept',
      'content-length',
      'cache-control',
      'cf-connecting-ip'
    ];
    res.header('access-control-allow-headers', allowed.join(', '));

    var method = req.method && req.method.toUpperCase && req.method.toUpperCase();

    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
    } else {
      next();
    }
  });

  //Set bitcoin headers
  app.use(function(req, res, next) {
    res.header('x-bitcoin-network', self.node.network.name); // TOOD use getNetworkName for regtest
    res.header('x-powered-by', 'bwsv2');
    next();
  });

  app.get('/txids', function(req, res, next) {
    var options = {};
    self.getWalletTxids(options, function(err, txids) {
      if (err) {
        return self._sendError(err, res);
      }
      res.jsonp(txids);
    });
  });

  app.get('/transactions', function(req, res, next) {
    var options = {};
    self.getWalletTransactions(options, function(err, txs) {
      if (err) {
        return self._sendError(err, res);
      }
      res.jsonp(txs);
    });
  });

  app.put('/addresses/:address', self._checkAddress.bind(self), function(req, res, next) {
    var addresses = [req.address];
    self.importWalletAddresses(addresses, function(err, newAddresses) {
      if (err) {
        return self._sendError(err, res);
      }
      if (!newAddresses.length) {
        return res.status(200).jsonp({
          address: req.address
        });
      }
      res.status(201).jsonp({
        address: req.address
      });
    });
  });

  app.post('/addresses', self._checkAddresses.bind(self), function(req, res, next) {
    var addresses = req.addresses;
    self.importWalletAddresses(addresses, function(err, newAddresses) {
      if (err) {
        return self._sendError(err, res);
      }
      if (!newAddresses.length) {
        return res.status(204).end();
      }
      res.status(201).jsonp({
        addresses: newAddresses
      });
    });
  });

  // Not Found
  app.use(function(req, res) {
    res.status(404).jsonp({
      status: 404,
      url: req.originalUrl,
      error: 'Not found'
    });
  });

};

Wallet.prototype.getPublishEvents = function() {
  return [];
};

module.exports = Wallet;
