'use strict';

var net = require('net');
var spawn = require('child_process').spawn;
var path = require('path');
var assert = require('assert');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var async = require('async');

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
  var options = this._getWorkerOptions();
  options.listen = this.config.getWriterSocketPath(process.pid);

  this._writerCallbacks = {};

  var spawnOptions = [path.resolve(__dirname, './writer-worker'), JSON.stringify(options)];

  // TODO use _writerSocket instead of ipc
  this._writerWorker = spawn('node', spawnOptions, {stdio: ['inherit', 'inherit', 'inherit', 'ipc']});

  // TODO handle errors?
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

  this._writerSocket.on('data', function(data) {
    var msg = JSON.parse(data.toString());
    if (msg.id && self._writerCallbacks[msg.id]) {
      var error = null;
      if (msg.error) {
        // TODO get stack from worker?
        error = new Error(error.message);
      }
      self._writerCallbacks[msg.id](error, msg.result);
    }
  });
};

WalletService.prototype._queueWriterSyncTask = function() {
  var self = this;
  var taskId = utils.getTaskId();

  var msg = JSON.stringify({
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

  self._writerSocket.write(msg, 'utf8');
};

WalletService.prototype._startWebWorkers = function(callback) {
  var options = this._getWorkerOptions();
  assert(this.config.data.wallet.port, '"port" option of "wallet" is expected');
  options.port = this.config.data.wallet.port;
  options.configPath = this.config.path;
  options.writerSocketPath = this.config.getWriterSocketPath(process.pid);

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
  var failed = false;
  utils.exitWorker(this._writerWorker, 10000, finish);
  utils.exitWorker(this._webWorkers, 10000, finish);

  function finish(err) {
    if (err) {
      console.error(err);
      if (!failed) {
        failed = true;
        return callback(err);
      }
    }
    exited++;
    if (exited >= 2) {
      return callback();
    }
  }
};

module.exports = WalletService;
