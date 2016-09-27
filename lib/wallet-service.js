'use strict';

var net = require('net');
var spawn = require('child_process').spawn;
var path = require('path');
var assert = require('assert');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var async = require('async');
var bitcoreNode = require('bitcore-node');
var log = bitcoreNode.log;

var messages = require('./messages');
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
function WalletService(options) {
  EventEmitter.call(this);

  this.node = options.node;
  this.log = this.node.log;
  this.bitcoind = null;
  this.db = null;

  this.config = new Config({
    network: this.node.network,
    path: options.configPath,
    data: options.data
  });

  if (options.routePrefix) {
    this.routePrefix = options.routePrefix;
  } else {
    this.routePrefix = 'wallet';
  }

  this._webWorkers = null;
  this._writerWorker = null;
  this._writerSocket = null;

  this._dirname = __dirname;
}
inherits(WalletService, EventEmitter);

WalletService.dependencies = ['bitcoind'];

WalletService.prototype._getWorkerOptions = function() {
  var options = {
    configPath: this.config.path,
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
  return options;
};

WalletService.prototype._startWriterWorker = function(callback) {
  var self = this;
  var options = this._getWorkerOptions();
  options.listen = this.config.getWriterSocketPath(process.pid);

  this._writerCallbacks = {};

  var spawnOptions = [path.resolve(__dirname, './writer-worker'), JSON.stringify(options)];

  // TODO use _writerSocket instead of ipc
  this._writerWorker = spawn('node', spawnOptions, {stdio: ['inherit', 'inherit', 'inherit', 'ipc']});

  this._writerWorker.on('exit', function(code) {
    if (code !== 0) {
      log.warn('Writer worker exited with code', code, ', shutting down.');
      self._writerWorker = null;
      self.node.stop(function(err) {
        if (err) {
          log.error(err);
        }
        process.exit(code);
      });
    }
  });

  this._writerWorker.once('message', function(msg) {
    assert(msg === 'ready');
    callback();
  });
};

WalletService.prototype._connectWriterSocket = function(callback) {
  var self = this;
  var path = this.config.getWriterSocketPath(process.pid);

  this._writerSocket = net.connect({path: path}, function() {
    callback();
  });

  this._writerSocket.on('error', function(err) {
    log.error('Writer socket error:', err.stack);
  });

  this._writerSocket.on('data', messages.parser(function(msg) {
    if (msg.id && self._writerCallbacks[msg.id]) {
      var error = null;
      if (msg.error) {
        // TODO get stack from worker?
        error = new Error(msg.error.message);
      }
      var fn = self._writerCallbacks[msg.id];
      delete self._writerCallbacks[msg.id];
      fn(error, msg.result);
    }
  }));
};

WalletService.prototype._queueWriterSyncTask = function() {
  var self = this;
  var taskId = utils.getTaskId();

  var params = [{
    bitcoinHeight: this.bitcoind.height,
    bitcoinHash: this.bitcoind.tiphash
  }];

  var msg = messages.encodeWriterMessage(taskId, 'sync', params, 0);
  self._writerSocket.write(msg);
};

WalletService.prototype._startWebWorkers = function(callback) {
  var options = this._getWorkerOptions();
  assert(this.config.data.wallet.port, '"port" option of "wallet" is expected');
  options.port = this.config.data.wallet.port;
  options.configPath = this.config.path;
  options.writerSocketPath = this.config.getWriterSocketPath(process.pid);
  options.numWorkers = this.config.data.wallet.workers || undefined;

  var spawnOptions = [path.resolve(this._dirname, './web-workers'), JSON.stringify(options)];
  this._webWorkers = spawn('node', spawnOptions, {stdio: 'inherit'});

  // TODO wait until web workers ready
  callback();
};

WalletService.prototype.start = function(callback) {
  var self = this;
  self.bitcoind = self.node.services.bitcoind;

  async.series([
    function(next) {
      self._startWriterWorker(next);
    },
    function(next) {
      self.config.setupConfig(next);
    },
    function(next) {
      self._connectWriterSocket(next);
    },
    function(next) {
      self._startWebWorkers(next);
    }
  ], function(err) {
    if (err) {
      return callback(err);
    }

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

WalletService.prototype.stop = function(callback) {
  var exited = 0;

  var numExit = 0;
  numExit += this._webWorkers ? 1 : 0;
  numExit += this._writerWorkers ? 1 : 0;
  if (numExit === 0) {
    return callback();
  }

  var failed = false;

  if (this._webWorkers) {
    utils.exitWorker(this._webWorkers, 10000, finish);
  }
  if (this._writerWorker) {
    utils.exitWorker(this._writerWorker, 10000, finish);
  }

  function finish(err) {
    if (err) {
      log.error(err);
      if (!failed) {
        failed = true;
        return callback(err);
      }
    }
    exited++;
    if (exited === numExit && !failed) {
      return callback();
    }
  }
};

module.exports = WalletService;
