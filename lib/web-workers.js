'use strict';

var assert = require('assert');
var cluster = require('cluster');
var http = require('http');
var https = require('https');
var net = require('net');
var numCPUs = require('os').cpus().length;

var _ = require('lodash');
var async = require('async');
var bitcore = require('bitcore-lib');
var bitcoreNode = require('bitcore-node');
var log = bitcoreNode.log;
var bodyParser = require('body-parser');
var compression = require('compression');
var express = require('express');
var lmdb = require('node-lmdb');
var morgan = require('morgan');
var secp = require('secp256k1');

var Config = require('./config');
var db = require('./db');
var messages = require('./messages');
var models = require('./models');
var utils = require('./utils');
var validators = require('./validators');
var version = require('../package.json').version;

function WebWorker(options) {
  this.db = null;
  this._initOptions(options);
  this._initClients();
}

WebWorker.prototype._initOptions = function(options) {
  /* jshint maxstatements: 20 */
  assert(options, 'first arguument is expected to be an object');
  this.network = bitcore.Networks.get(options.network);
  assert(this.network, '"network" is an expected option, please specify "livenet", "testnet" or "regtest"');

  assert(options.bitcoinHeight >= 0, '"bitcoinHeight" is expected');
  assert(options.bitcoinHash, '"bitcoinHash" is expected');
  assert(options.clientsConfig && options.clientsConfig.length > 0, '"clientsConfig" is expected');
  assert(options.port, '"port" is an expected option');
  assert(options.writerSocketPath, '"writerSocketPath" is an expected option');
  assert(options.configPath, '"configPath" is an expected option');

  this.port = options.port;
  this.bitcoinHeight = options.bitcoinHeight;
  this.bitcoinHash = options.bitcoinHash;
  this.clientsConfig = options.clientsConfig;
  this.writerSocketPath = options.writerSocketPath;

  this._writerCallbacks = {};
  this._stopping = false;

  this.config = new Config({
    network: options.network,
    path: options.configPath
  });

  this.safeConfirmations = options.safeConfirmations || WebWorker.DEFAULT_SAFE_CONFIRMATIONS;
};

WebWorker.DEFAULT_SAFE_CONFIRMATIONS = 12;

WebWorker.prototype.start = function(callback) {
  var self = this;
  var dbPath = self.config.getDatabasePath();
  self.db = db.open(dbPath, true);

  async.series([
    function(next) {
      self._connectWriterSocket(next);
    },
    function(next) {
      self._startListener(next);
    }
  ], callback);
};

WebWorker.prototype.stop = function(callback) {
  if (!this._stopping) {
    this._stopping = true;
    if (this.db) {
      db.close(this.db);
      setImmediate(callback);
    } else {
      setImmediate(callback);
    }
  } else {
    setImmediate(callback);
  }
};

WebWorker.prototype._initClients = function() {
  var clients = utils.getClients(this.clientsConfig);
  utils.setClients(this, clients);
};

WebWorker.prototype._connectWriterSocket = function(callback) {
  var self = this;

  this._writerCallbacks = {};

  this._writerSocket = net.connect({path: self.writerSocketPath}, function() {
    setImmediate(callback);
  });

  this._writerSocket.on('error', function(err) {
    log.error('Writer socket error:', err.stack);
  });

  this._writerSocket.on('data', messages.parser(function(msg) {
    if (msg.id && self._writerCallbacks[msg.id]) {
      var error = null;
      if (msg.error) {
        error = new Error(msg.error.message);
      }
      var fn = self._writerCallbacks[msg.id];
      delete self._writerCallbacks[msg.id];
      fn(error, msg.result);
    }
  }));
};

WebWorker.prototype._queueWriterTask = function(method, params, priority, callback) {
  var self = this;
  assert(Array.isArray(params), '"params" is expected to be an array');
  assert(_.isFunction(callback), '"callback" is expected to be a function');

  var taskId = utils.getTaskId();
  this._writerCallbacks[taskId] = callback;

  var msg = messages.encodeWriterMessage(taskId, method, params, priority);

  self._writerSocket.write(msg, 'utf8', function(err) {
    if (err) {
      delete self._writerCallbacks[taskId];
      return log.error(err);
    }
  });
};

WebWorker.prototype._transformRawTransaction = function(txn, wallet, walletId, blockIndex, result) {
  var self = this;
  assert(Buffer.isBuffer(walletId), '"walletId" is expected to be a buffer');

  function isCoinbase(result) {
    if (result.vin[0] && result.vin[0].coinbase) {
      return true;
    }
    return false;
  }

  var tx = {
    blockHash: result.blockhash,
    blockIndex: blockIndex,
    height: result.height ? result.height : -1,
    blockTimestamp: result.time,
    version: result.version,
    hash: result.txid,
    locktime: result.locktime,
    inputSatoshis: 0,
    outputSatoshis: 0
  };

  if (isCoinbase(result)) {
    tx.coinbase = true;
  }

  function isWalletAddress(address) {
    // Will check the wallet bloom filter to see if it matches, and then verify that
    // it is part of the wallet.
    if (address && wallet.addressFilter.contains(bitcore.Address(address).hashBuffer)) {
      var walletAddress = models.WalletAddress(walletId, address);
      var buffer = txn.getBinary(self.db.addresses, walletAddress.getKey());
      if (buffer) {
        return true;
      }
    }
    return false;
  }

  function filterInput(input) {
    // Will apply following logic:
    // - checks if the input belongs to the wallet
    // - omits the scriptSig
    // - sums each input
    if (!input.coinbase) {
      assert(bitcore.util.js.isNaturalNumber(input.valueSat), 'input "valueSat" is expected to be number of satoshis');
      tx.inputSatoshis += input.valueSat;
    }
    return {
      wallet: isWalletAddress(input.address),
      satoshis: _.isUndefined(input.valueSat) ? null : input.valueSat,
      address: _.isUndefined(input.address) ? null : input.address,
      prevTxId: input.txid || null,
      outputIndex: _.isUndefined(input.vout) ? null : input.vout,
      sequence: input.sequence
    };
  }

  function filterOutput(output) {
    // Will apply following logic:
    // - checks if the output belongs to the wallet
    // - omits extraneous scriptPubKey and spent information
    // - sums each output
    var script = null;
    var address = null;
    var wallet = false;
    if (output.scriptPubKey) {
      script = output.scriptPubKey.hex;
    }
    if (output.scriptPubKey && output.scriptPubKey.addresses && output.scriptPubKey.addresses.length === 1) {
      address = output.scriptPubKey.addresses[0];
      wallet = isWalletAddress(address);
    }
    assert(bitcore.util.js.isNaturalNumber(output.valueSat), 'output "valueSat" is expected to be number of satoshis');
    tx.outputSatoshis += output.valueSat;
    return {
      script: script,
      satoshis: output.valueSat,
      address: address,
      wallet: wallet
    };
  }

  tx.inputs = result.vin.map(filterInput);
  tx.outputs = result.vout.map(filterOutput);

  // Calculate the fee for this transation
  if (!tx.coinbase) {
    tx.feeSatoshis = tx.inputSatoshis - tx.outputSatoshis;
  } else {
    tx.feeSatoshis = 0;
  }

  return tx;
};

/* jshint maxparams: 5 */
WebWorker.prototype._importTransaction = function(txn, wallet, walletId, txidInfo, callback) {
  var self = this;
  assert(Buffer.isBuffer(walletId), '"walletId" is expected to be a buffer');

  var blockIndex = txidInfo[1];
  var txid = txidInfo[2];

  this.clients.getRawTransaction(txid.toString('hex'), 1, function(err, response) {
    if (err) {
      return callback(utils.wrapRPCError(err));
    }

    var transaction = self._transformRawTransaction(txn, wallet, walletId, blockIndex, response.result);

    // Only save the transaction locally if it is confirmed beyond safeConfirmations
    // TODO: cache all transactions, and invalidate when blocks arrive, if there is a conflict/change?
    var confirmations = response.result.confirmations;
    if (confirmations > self.safeConfirmations) {
      var idHex = walletId.toString('hex');
      self._queueWriterTask('saveTransaction', [idHex, transaction], 1 /* priority */, function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, transaction);
      });
    } else {
      callback(null, transaction);
    }
  });
};

WebWorker.prototype.getWalletTransactions = function(walletId, options, callback) {
  var self = this;
  assert(Buffer.isBuffer(walletId), '"walletId" is expected to be a buffer');
  var txn = this.db.env.beginTxn({readOnly: true});

  var walletBuffer = txn.getBinary(this.db.wallets, walletId);
  if (!walletBuffer) {
    txn.abort();
    var error = new Error('Wallet not found');
    error.statusCode = 404;
    return callback(error);
  }

  var wallet = models.Wallet.fromBuffer(walletId, walletBuffer);

  this._getLatestTxids(txn, walletId, options, function(err, result) {
    if (err) {
      txn.abort();
      return callback(err);
    }
    // TODO Using mapLimit or map here will cause concurrency isssue
    // that will halt when using _importTransaction
    async.mapSeries(result.txids, function(txidInfo, next) {
      var txid = txidInfo[2];
      var key = models.WalletTransaction.getKey(walletId, txid);
      var buffer = txn.getBinary(self.db.txs, key);
      if (!buffer) {
        self._importTransaction(txn, wallet, walletId, txidInfo, function(err, tx) {
          next(err, tx);
        });
      } else {
        var tx = models.WalletTransaction.fromBuffer(walletId, buffer);
        next(null, tx.value);
      }
    }, function(err, transactions) {
      txn.abort();
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
};

WebWorker.prototype.getWalletRawTransactions = function(walletId, options, callback) {
  var self = this;
  assert(Buffer.isBuffer(walletId), '"walletId" is expected to be a buffer');
  var txn = this.db.env.beginTxn({readOnly: true});

  var walletBuffer = txn.getBinary(this.db.wallets, walletId);
  if (!walletBuffer) {
    txn.abort();
    var error = new Error('Wallet not found');
    error.statusCode = 404;
    return callback(error);
  }

  this._getLatestTxids(txn, walletId, options, function(err, result) {
    if (err) {
      txn.abort();
      return callback(err);
    }
    async.mapSeries(result.txids, function(txidInfo, next) {
      var txid = txidInfo[2];
      self.clients.getRawTransaction(txid.toString('hex'), function(err, res) {
        if (err) {
          return callback(utils.wrapRPCError(err));
        }
        next(null, res.result);
       });
    }, function(err, rawtransactions) {
      txn.abort();
      if (err) {
        return callback(err);
      }
      callback(null, {
        rawtransactions: rawtransactions,
        start: result.start,
        end: result.end
      });
    });
  });
};

var NULL_TXID = new Buffer(new Array(32));

WebWorker.prototype.getWalletUTXOs = function(walletId, options, callback) {
  assert(Buffer.isBuffer(walletId), '"walletId" is expected to be a buffer');
  var self = this;
  var txn = this.db.env.beginTxn({readOnly: true});

  var utxos = [];

  var cursor = new lmdb.Cursor(txn, this.db.utxos);

  var start = models.WalletUTXO.getKey(walletId, NULL_TXID, 0);
  var found = cursor.goToRange(start);

  function iterator() {
    cursor.getCurrentBinary(function(key, value) {
      var utxo = models.WalletUTXO.fromBuffer(key, value, self.network);
      utxos.push(utxo);

      var nextFound = cursor.goToNext();
      if (nextFound && utxos.length < options.limit) {
        // TODO make sure maximum call stack is not reached
        iterator();
      } else {
        cursor.close();
        var result = {
          utxos: utxos
        };
        if (utxos.length === options.limit) {
          result.end = {}; // TODO
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
      utxos: utxos
    });
  }

};

WebWorker.prototype._getLatestTxids = function(txn, walletId, options, callback) {
  assert(Buffer.isBuffer(walletId), '"walletId" is expected to be a buffer');
  var txids = [];

  try {
    options = validators.sanitizeRangeOptions(options);
  } catch(err) {
    return callback(err);
  }

  var cursor = new lmdb.Cursor(txn, this.db.txids);

  var start = models.WalletTxid.create(walletId, options.height, options.index);
  var found = cursor.goToRange(start.getKey());

  if (found) {
    iterate();
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

  var lastParsedKey;
  var looped;
  var reachedLimit;
  var nextOne;
  var pastEnd;
  var lookAhead;

  function iterate() {
    cursor.getCurrentBinary(function(key, value) {
      var parsedKey = models.WalletTxid.parseKey(key);
      pastEnd = utils.isRangeMoreThan(parsedKey, options.end);

      if (lastParsedKey && !utils.isRangeMoreThan(parsedKey, lastParsedKey)) {
        looped = true;
      }

      lastParsedKey = parsedKey;

      if (!pastEnd && !looped && !lookAhead) {
        txids.push([parsedKey.height, parsedKey.index, value]);
        nextOne = cursor.goToNext();
        reachedLimit = txids.length >= options.limit;
      }

      if (nextOne && !pastEnd && !looped && !lookAhead) {
        if (reachedLimit) {
          lookAhead = true;
        }
        iterate();
      } else {
        var result = {};
        if (reachedLimit) {
          result.end = {
            height: parsedKey.height,
            index: parsedKey.index
          };
        }
        result.txids = txids;
        result.start = {
          height: options.height,
          index: options.index
        };
        cursor.close();
        callback(null, result);
      }
    });
  }
};

WebWorker.prototype.getBalance = function(walletId, callback) {
  assert(Buffer.isBuffer(walletId), '"walletId" is expected to be a buffer');
  var txn = this.db.env.beginTxn({readOnly: true});
  var walletBuffer = txn.getBinary(this.db.wallets, walletId);
  txn.abort();

  if (!walletBuffer) {
    var error = new Error('Wallet not found');
    error.statusCode = 404;
    return callback(error);
  }

  var wallet = models.Wallet.fromBuffer(walletId, walletBuffer);

  callback(null, {balance: wallet.balance});
};

/**
 * Will get the latest transaction ids for the wallet.
 * @param options
 * @param options.height - Starting block height
 * @param options.index - Starting block index
 * @param options.limit - Total number of txids to return
 */
WebWorker.prototype.getWalletTxids = function(walletId, options, callback) {
  assert(Buffer.isBuffer(walletId), '"walletId" is expected to be a buffer');
  var txn = this.db.env.beginTxn({readOnly: true});

  this._getLatestTxids(txn, walletId, options, function(err, result) {
    txn.abort();
    if (err) {
      return callback(err);
    }

    result.txids = result.txids.map(function(txidInfo) {
      return txidInfo[2].toString('hex');
    });

    callback(null, result);
  });

};

WebWorker.prototype._updateLatestTip = function() {
  var self = this;
  var txn = this.db.env.beginTxn({readOnly: true});

  var cursor = new lmdb.Cursor(txn, this.db.blocks);
  var found = cursor.goToLast();
  if (found !== null) {
    cursor.getCurrentBinary(function(key, value) {
      var walletBlock = models.WalletBlock.fromBuffer(key, value);
      self.bitcoinHeight = walletBlock.height;
      self.bitcoinHash = walletBlock.blockHash.toString('hex');
      cursor.close();
      txn.abort();
    });
  } else {
    cursor.close();
    txn.abort();
    log.info('Active syncing is idle, there are currently no wallets');
  }
};

WebWorker.prototype._endpointBalance = function() {
  var self = this;
  return function(req, res) {
    self.getBalance(req.walletId, function(err, balance) {
      if (err) {
        return utils.sendError(err, res);
      }
      res.status(200).jsonp(balance);
    });
  };
};

WebWorker.prototype._endpointTxids = function() {
  var self = this;
  return function(req, res) {
    self.getWalletTxids(req.walletId, req.range, function(err, txids) {
      if (err) {
        return utils.sendError(err, res);
      }
      res.status(200).jsonp(txids);
    });
  };
};

WebWorker.prototype._endpointTransactions = function() {
  var self = this;
  return function(req, res) {
    self.getWalletTransactions(req.walletId, req.range, function(err, txs) {
      if (err) {
        return utils.sendError(err, res);
      }
      res.status(200).jsonp(txs);
    });
  };
};

WebWorker.prototype._endpointRawTransactions = function() {
  var self = this;
  return function(req, res) {
    self.getWalletRawTransactions(req.walletId, req.range, function(err, txs) {
      if (err) {
        return utils.sendError(err, res);
      }
      res.status(200).jsonp(txs);
    });
  };
};

WebWorker.prototype._endpointUTXOs = function() {
  var self = this;
  return function(req, res) {
    // TODO specify query options: height, satoshis, and limit
    var options = {
      limit: 10
    };
    self.getWalletUTXOs(req.walletId, options, function(err, utxos) {
      if (err) {
        return utils.sendError(err, res);
      }
      res.status(200).jsonp(utxos);
    });
  };
};

WebWorker.prototype._endpointPutAddress = function() {
  var self = this;
  return function(req, res) {
    var addresses = [req.address];
    var walletId = req.walletId;
    var idHex = walletId.toString('hex');
    self._queueWriterTask('importWalletAddresses', [idHex, addresses], 5, function(err, newAddresses) {
      if (err) {
        return utils.sendError(err, res);
      }
      if (!newAddresses || !newAddresses.length) {
        return res.status(200).jsonp({
          address: req.address
        });
      }
      res.status(201).jsonp({
        address: req.address
      });
    });
  };
};

WebWorker.prototype._endpointPostAddresses = function() {
  var self = this;
  return function(req, res) {
    var addresses = req.addresses;
    var walletId = req.walletId;
    var idHex = walletId.toString('hex');
    self._queueWriterTask('importWalletAddresses', [idHex, addresses], 10, function(err, newAddresses) {
      if (err) {
        return utils.sendError(err, res);
      }
      if (!newAddresses || !newAddresses.length) {
        return res.status(204).end();
      }
      res.status(201).jsonp({
        addresses: newAddresses
      });
    });
  };
};

WebWorker.prototype._endpointPutWallet = function() {
  var self = this;
  return function(req, res) {
    var params = [req.walletId.toString('hex')];
    self._queueWriterTask('createWallet', params, 20, function(err, walletId) {
      if (err) {
        return utils.sendError(err, res);
      }
      if (!walletId) {
        // TODO: send walletId and use status 200?
        return res.status(204).end();
      }
      res.status(201).jsonp({
        walletId: walletId.toString('hex')
      });
    });
  };
};

WebWorker.prototype._endpointGetHeightsFromTimestamps = function() {
  var self = this;
  return function(req, res) {
    var errors = validators.checkDate([req.query.startdate, req.query.enddate]);
    if (errors.length > 0) {
      return utils.sendError({
        message: 'improper date format',
        statusCode: 400
      }, res);
    }
    var dates = [];
    dates.push(new Date(utils.toIntIfNumberLike(req.query.startdate)));
    dates.push(new Date(utils.toIntIfNumberLike(req.query.enddate)));
    self._convertDateToHeight(dates, function(err, blockHeights) {
      if (err) {
        if (!_.isObject(err) || err.code > 599 || err.code < 200) {
          err = {
            code: 400,
            message: err
          };
        }
        return res.status(err.code).jsonp({
          status: err.code,
          url: req.originalUrl,
          error: err.message
        });
      }
      return res.jsonp({
        result: blockHeights
      });
    });
  };
};

WebWorker.prototype._endpointGetInfo = function() {
  return function(req, res) {
    res.jsonp({
      version: version
    });
  };
};

WebWorker.prototype._endpointNotFound = function() {
  return function(req, res) {
    res.status(404).jsonp({
      status: 404,
      url: req.originalUrl,
      error: 'Not found'
    });
  };
};

WebWorker.prototype._middlewareHeaders = function() {
  return function(req, res, next) {
    res.header('x-bitcoin-network', req.networkName);
    res.header('x-bitcoin-height', req.bitcoinHeight);
    res.header('x-bitcoin-hash', req.bitcoinHash);
    res.header('x-powered-by', 'bwdb');
    next();
  };
};

WebWorker.prototype._middlewareLogger = function() {
  morgan.token('remote-forward-addr', function(req){
    return utils.getRemoteAddress(req);
  });
  var logFormat = ':remote-forward-addr ":method :url" :status :res[content-length] :response-time ":user-agent" ';
  var logStream = utils.createLogStream(function(data) {
    log.info(data.toString());
  });

  return morgan(logFormat, {stream: logStream});
};

WebWorker.prototype._middlewareChainInfo = function() {
  var self = this;
  return function(req, res, next) {
    req.network = self.network;
    req.networkName = self.config.getNetworkName();

    self._updateLatestTip();

    req.bitcoinHeight = self.bitcoinHeight;
    req.bitcoinHash = self.bitcoinHash;
    next();
  };
};

WebWorker.prototype._getBlockHeights = function(blockHashes, callback) {
  var self = this;
  async.map(blockHashes, function(blockHash, next) {
    self.clients.getBlock(blockHash, function(err, response) {
      if (err) {
        return next(utils.wrapRPCError(err));
      }
      var result = response.result;
      next(null, result.height);
    });
  }, callback);
};

WebWorker.prototype._convertDateToHeight = function(dates, callback) {
  var self = this;
  async.waterfall([
    function(next) {
      var hashDates = _.sortBy(dates);
      hashDates[1].setHours(0,0,0,0);
      hashDates[0].setHours(0,0,0,0);
      hashDates[1] = Math.floor(hashDates[1].getTime() / 1000);
      hashDates[0] = Math.floor(hashDates[0].getTime() / 1000);
      self.clients.getBlockHashes(hashDates[1], hashDates[0], { noOrphans: true }, function(err, response) {
        if (err) {
          return next(utils.wrapRPCError(err));
        }
        var result = _.compact(response.result);
        if (result.length < 2) {
          return next(utils.wrapRPCError({
            code: 404,
            message: 'no results found'
          }));
        }
        var firstBlockHash = result[0];
        var lastBlockHash = result[result.length - 1];
        next(null, [firstBlockHash, lastBlockHash]);
      });
    }, function(blockHashes, next) {
      self._getBlockHeights(blockHashes, next);
    }], callback);
};

WebWorker.prototype._middlewareCheckSignature = function() {
  /* jshint maxstatements: 25 */
  return function(req, res, next) {
    var identity = req.header('x-identity');
    if (!identity) {
      return next();
    }
    var signature = req.header('x-signature');
    var nonce = req.header('x-nonce');
    if (validators.checkAuthHeaders(req, res)) {
      var fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
      var hashedData = utils.generateHashForRequest(req.method,
        fullUrl, req.rawBodyBuffer, new Buffer(nonce, 'hex'));
      var verified = false;
      var signatureImport;
      try {
        signatureImport = secp.signatureImport(new Buffer(signature, 'hex'));
      } catch(e) {
        return utils.sendError({
          message: 'x-signature format is invalid.',
          statusCode: 400
        }, res);
      }
      try {
        verified = secp.verify(hashedData, signatureImport, new Buffer(identity, 'hex'));
      } catch(e) {
        return utils.sendError({
          message: 'x-signature verification error.',
          statusCode: 400
        }, res);
      }
      if (verified) {
        req.identity = identity;
        req.nonce = nonce;
        req.signature = signature;
      } else {
        return utils.sendError({
          message: 'x-signature verification failed.',
          statusCode: 401
        }, res);
      }
      next();
    }
  };
};

WebWorker.prototype._middlewareCheckAuth = function() {
  var self = this;
  return function(req, res, next) {
    if (self.config.isAuthorized(req.identity)) {
      next();
    } else {
      return utils.sendError({
        message: 'Unknown identity',
        statusCode: 401
      }, res);
    }
  };
};

WebWorker.prototype._setupMiddleware = function(app) {
  app.use(this._middlewareChainInfo());
  app.use(this._middlewareLogger());
  app.use(compression());
  app.use(bodyParser.json({verify: function(req, res, buf) {
    if (buf) {
      req.rawBodyBuffer = buf;
    }
  }}));
  app.use(bodyParser.urlencoded({extended: true}));
  app.use(utils.enableCORS);
  app.use(this._middlewareCheckSignature());
  app.use(this._middlewareCheckAuth());
  app.use(this._middlewareHeaders());
};

WebWorker.prototype._setupRoutes = function(app) {
  var s = this;
  var v = validators;

  app.get('/info',
    s._endpointGetInfo()
  );
  app.get('/wallets/:walletId/balance',
    v.checkWalletId,
    s._endpointBalance()
  );
  app.get('/wallets/:walletId/txids',
    v.checkWalletId,
    v.checkRangeParams,
    s._endpointTxids()
  );
  app.get('/wallets/:walletId/transactions',
    v.checkWalletId,
    v.checkRangeParams,
    s._endpointTransactions()
  );
  app.get('/wallets/:walletId/rawtransactions',
    v.checkWalletId,
    v.checkRangeParams,
    s._endpointRawTransactions()
  );
  app.get('/wallets/:walletId/utxos',
    v.checkWalletId,
    s._endpointUTXOs()
  );
  app.put('/wallets/:walletId/addresses/:address',
    v.checkWalletId,
    v.checkAddress,
    s._endpointPutAddress()
  );
  app.post('/wallets/:walletId/addresses',
    v.checkWalletId,
    v.checkAddresses,
    s._endpointPostAddresses()
  );
  app.put('/wallets/:walletId',
    v.checkWalletId,
    s._endpointPutWallet()
  );
  app.get('/info/timestamps',
    s._endpointGetHeightsFromTimestamps()
  );
  app.use(s._endpointNotFound());
};

WebWorker.prototype._startListener = function() {
  var app = express();
  this._setupMiddleware(app);
  this._setupRoutes(app);

  if (this.config.hasTLS()) {
    var options = this.config.getTLSOptions();
    this.server = https.createServer(options, app);
  } else {
    this.server = http.createServer(app);
  }
  this.server.listen(this.port);
  this.server.timeout = 480000; //8 minute timeout
};

/* istanbul ignore next */

function masterMain(workerOptions) {
  function logStatus(worker, code, signal) {
    if (signal) {
      log.info('Web cluster worker ' + worker.id + ' was killed by signal: ' + signal);
    } else if (code !== 0) {
      log.info('Web cluster worker ' + worker.id + ' exited with code: ' + code);
    } else {
      log.info('Web cluster worker ' + worker.id + ' exited cleanly');
    }
  }

  function initWorker(worker) {
    worker.on('error', function(err) {
      log.error('Web worker error:', err.stack);
    });
  }

  var workers = [];
  var numWorkers = workerOptions.numWorkers || numCPUs;
  for (var i = 0; i < numWorkers; i++) {
    var workerProcess = cluster.fork();
    workers.push(workerProcess);
  }

  cluster.on('disconnect', function(worker) {
    log.warn('Web cluster worker ' + worker.id + ' has disconnected');
  });

  cluster.on('exit', function(worker, code, signal) {
    if (worker.suicide !== true && (signal || code !== 0)) {
      logStatus(worker, code, signal);
      var newWorker = cluster.fork();
      var indexOfWorker = workers.indexOf(worker);
      if (indexOfWorker >= 0) {
        workers.splice(indexOfWorker, 1);
      }
      log.warn('Web cluster worker respawned with worker id: ' + newWorker.id);
      workers.push(newWorker);
      initWorker(newWorker);
    } else {
      logStatus(worker, code, signal);
    }
  });

  workers.forEach(initWorker);

  process.on('SIGINT', function() {
    workers.forEach(function(worker) {
      if (worker.isConnected()) {
        worker.send({shutdown: true});
      }
    });
  });
}

/* istanbul ignore next */

function workerMain(workerOptions) {
  var EXIT_TIMEOUT = 5000;

  var worker = new WebWorker(workerOptions);
  var shuttingDown = false;

  function shutdown() {
    if (!shuttingDown) {
      shuttingDown = true;
      worker.stop(function(err) {
        if (err) {
          throw err;
        }
        process.exit(0);
      });

      setTimeout(function() {
        log.info('Web worker: could not close connections on time, forcefully shutting down');
        process.exit(0);
      }, EXIT_TIMEOUT);
    }
  }

  function start() {
    worker.start(function(err) {
      if (err) {
        throw err;
      }
    });
  }

  worker.config.loadConfig(function(err) {
    if (err) {
      throw err;
    }
    start();
    process.on('message', function(msg) {
      if (msg.shutdown) {
        shutdown();
      }
    });
  });

  process.on('SIGINT', function() {
    shutdown();
  });

}

/* istanbul ignore next */

if (require.main === module) {

  var workerOptions = JSON.parse(process.argv[2]);

  if (cluster.isMaster) {
    process.title = 'bwdb-web-master';
    masterMain(workerOptions);
  } else {
    process.title = 'bwdb-web';
    workerMain(workerOptions);
  }

}

module.exports = WebWorker;
