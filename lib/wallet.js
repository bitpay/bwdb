'use strict';

var spawn = require('child_process').spawn;
var path = require('path');
var assert = require('assert');
var Writable = require('stream').Writable;
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var async = require('async');
var bitcore = require('bitcore-lib');
var bodyParser = require('body-parser');
var compression = require('compression');
var lmdb = require('node-lmdb');
var morgan = require('morgan');

var db = require('./db');
var models = require('./models');
var utils = require('./utils');
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

Wallet.prototype._createWriterWorker = function(callback) {
  var self = this;
  var options = {
    network: this.config.getNetworkName(),
    bitcoinHeight: this.bitcoind.height,
    bitcoinHash: this.bitcoind.tiphash
  };
  if (this.bitcoind.spawn) {
    options.clientsConfig = [{
      rpcport: this.bitcoind.spawn.config.rpcport,
      rpcuser: this.bitcoind.spawn.config.rpcuser,
      rpcpassword: this.bitcoind.spawn.config.rpcpassword
    }];
  } else {
    options.clientsConfig = this.bitcoind.options.connect;
  }
  this._writerTaskId = 1;
  this._writerCallbacks = {};
  var spawnOptions = [path.resolve(__dirname, './writer'), JSON.stringify(options)];
  this.writer = spawn('node', spawnOptions, {stdio: ['inherit', 'inherit', 'inherit', 'ipc']});
  // TODO handle errors?
  this.writer.once('message', function(msg) {
    // TODO handle this as another job?
    assert(msg === 'ready');
    callback();
  });
  this.writer.on('message', function(msg) {
    if (msg.id && self._writerCallbacks[msg.id]) {
      var error = null;
      if (msg.error) {
        // TODO get stack from worker?
        error = new Error(error.message);
      }
      self._writerCallbacks[msg.id](error, msg.result)
    }
  });
};

Wallet.prototype._getNextTaskId = function() {
  this._writerTaskId += 1;
  return this._writerTaskId;
}

Wallet.prototype._queueWriterTask = function(method, params, priority, callback) {
  var self = this;
  assert(Array.isArray(params), '"params" is expected to be an array');

  var taskId = this._getNextTaskId();
  if (callback) {
    this._writerCallbacks[taskId] = callback;
  }
  self.writer.send({
    task: {
      id: taskId,
      method: method,
      params: params
    },
    priority: priority
  });
};

Wallet.prototype._queueWriterSyncTask = function() {
  var self = this;
  var taskId = this._getNextTaskId();
  self.writer.send({
    task: {
      id: taskId,
      method: 'sync',
      params: [{
        bitcoinHeight: this.bitcoind.height,
        bitcoinHash: this.bitcoind.tiphash
      }]
    },
    priority: 1
  });
};

Wallet.prototype.start = function(callback) {
  var self = this;
  self.bitcoind = self.node.services.bitcoind;

  self._createWriterWorker(function(err) {
    if (err) {
      return callback(err);
    }

    var dbPath = self.config.getDatabasePath();
    self.db = db.open(dbPath);

    self.emit('ready');
    self.log.info('Wallet Ready');
    self._queueWriterSyncTask();

    self.bitcoind.on('tip', function() {
      if(!self.node.stopping) {
        self._queueWriterSyncTask();
      }
    });
    callback();
  });
};

Wallet.prototype.stop = function(callback) {
  if (this.db) {
    db.close(this.db);
    setImmediate(callback);
  } else {
    setImmediate(callback);
  }
};

Wallet.prototype._getLatestTxids = function(txn, options, callback) {
  var txids = [];

  try {
    options = this._sanitizeRangeOptions(options);
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
        // TODO include blockhash of start/tip height?
        var result = {
          txids: txids,
          start: {
            height: options.height,
            index: options.index
          }
        };
        // Only include "end" if there are more results
        if (txids.length === options.limit) {
          result.end = models.WalletTxid.parseKey(key);
        }
        callback(null, result);
      }
    });
  }

  if (found) {
    iterator();
  } else {
    cursor.close();
    callback(null, {
      txids: txids,
      start: {
        height: options.height,
        index: options.index
      }
    });
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

  this._getLatestTxids(txn, options, function(err, result) {
    txn.abort();
    if (err) {
      return callback(err);
    }

    if (!options.buffers) {
      result.txids = result.txids.map(function(txid) {
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
    // TODO wait for callback?
    self._queueWriterTask('saveTransaction', [transaction], 20);
    callback(null, transaction);
  });
};

Wallet.prototype.getWalletTransactions = function(options, callback) {
  var self = this;
  var txn = this.db.env.beginTxn({readonly: true});

  this._getLatestTxids(txn, options, function(err, result) {
    async.mapLimit(result.txids, self.defaults.historyConcurrency, function(txid, next) {
      var key = models.WalletTransaction.getKeyFromTxid(txid);
      var buffer = txn.getBinary(self.db.txs, key.toString('hex'));
      if (!buffer) {
        self._importTransaction(txn, txid, next);
      } else {
        var tx = models.WalletTransaction.fromBuffer(buffer);
        next(null, tx);
      }
    }, function(err, transactions) {
      if (err) {
        txn.abort();
        return callback(err);
      }
      txn.commit();
      self.db.env.sync(function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, {
          transactions: transactions,
          start: result.start,
          end: result.end
        });
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

Wallet.prototype._sendError = function (err, res) {
  if (err.statusCode)  {
    res.status(err.statusCode).send(err.message);
  } else {
    this.log.error(err.stack);
    res.status(503).send(err.message);
  }
};

Wallet.prototype._sanitizeRangeOptions = function(options) {
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

Wallet.prototype._checkRangeParams = function(req, res, next) {
  var self = this;
  var range = {
    height: parseInt(req.query.height),
    index: parseInt(req.query.index),
    limit: parseInt(req.query.limit)
  };

  try {
    range = this._sanitizeRangeOptions(range);
  } catch(e) {
    return self._sendError({
      message: 'Invalid params: ' + e.message,
      statusCode: 400
    }, res);
  }

  req.range = range;
  next();
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
    return utils.getRemoteAddress(req);
  });
  var logFormat = ':remote-forward-addr ":method :url" :status :res[content-length] :response-time ":user-agent" ';
  var logStream = this.createLogInfoStream();
  app.use(morgan(logFormat, {stream: logStream}));

  //Enable compression
  app.use(compression());

  //Enable urlencoded data
  app.use(bodyParser.urlencoded({extended: true}));

  //Enable CORS
  app.use(utils.enableCORS);

  //Set bitcoin headers
  app.use(function(req, res, next) {
    res.header('x-bitcoin-network', self.node.network.name); // TOOD use getNetworkName for regtest
    res.header('x-powered-by', 'bwsv2');
    next();
  });

  app.get('/txids', self._checkRangeParams.bind(self), function(req, res) {
    self.getWalletTxids(req.range, function(err, txids) {
      if (err) {
        return self._sendError(err, res);
      }
      res.jsonp(txids);
    });
  });

  app.get('/transactions', self._checkRangeParams.bind(self), function(req, res) {
    self.getWalletTransactions(req.range, function(err, txs) {
      if (err) {
        return self._sendError(err, res);
      }
      res.jsonp(txs);
    });
  });

  app.put('/addresses/:address', self._checkAddress.bind(self), function(req, res) {
    var addresses = [req.address];
    self._queueWriterTask('importWalletAddresses', [addresses], 5, function(err, newAddresses) {
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
    })
  });

  app.post('/addresses', self._checkAddresses.bind(self), function(req, res) {
    var addresses = req.addresses;
    self._queueWriterTask('importWalletAddresses', [addresses], 10, function(err, newAddresses) {
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
