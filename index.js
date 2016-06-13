'use strict';

var inherits = require('util').inherits;
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var bitcore = require('bitcore-lib');
var leveldown = require('leveldown');
var Block = bitcore.Block;
var BufferUtil = bitcore.util.buffer;
var async = require('async');
var $ = bitcore.util.preconditions;

function BitcoinWallet(options) {
  EventEmitter.call(this);
  this.node = options.node;
  this.db = null;
  this.tip = null;
}
inherits(BitcoinWallet, EventEmitter);

BitcoinWallet.dependencies = ['bitcoind'];

BitcoinWallet.prototype._getApplicationDir = function() {
  var appPath = path.resolve(process.env.HOME, './.bwsv2');
  return appPath;
};

BitcoinWallet.prototype._getDatabasePath = function() {
  var appPath = this._getApplicationDir();
  if (this.node.network === bitcore.Networks.livenet) {
    this.dataPath = path.resolve(appPath, './wallet-livenet.db');
  } else if (this.node.network === bitcore.Networks.testnet) {
    if (this.node.network.regtestEnabled) {
      this.dataPath = path.resolve(appPath, './wallet-regtest.db');
    } else {
      this.dataPath = path.resolve(appPath, '/wallet-testnet3.db');
    }
  } else {
    throw new Error('Unknown network: ' + this.network);
  }
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
      self._setupDatabase(next);
    },
    function(next) {
      self._initializeTip(next);
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
    this.db.close();
  }
  setImmediate(callback);
};

BitcoinWallet.prototype._connectBlock = function(callback) {
  setImmediate(callback);
};

BitcoinWallet.prototype._disconnectTip = function(callback) {
  setImmediate(callback);
};

BitcoinWallet.prototype._initializeTip = function(callback) {
  setImmediate(callback);
};

BitcoinWallet.prototype._initialSync = function(callback) {
  setImmediate(callback);
};

BitcoinWallet.prototype._activeSync = function(callback) {
  var self = this;
  var height;
  async.whilst(function() {
    if (self.node.stopping) {
      return false;
    }
    height = self.tip.__height;
    return height < self.node.services.bitcoind.height;
  }, function(done) {
    self.node.getRawBlock(height + 1, function(err, blockBuffer) {
      if (err) {
        return done(err);
      }

      var block = Block.fromBuffer(blockBuffer);

      // TODO: expose prevHash as a string from bitcore
      var prevHash = BufferUtil.reverse(block.header.prevHash).toString('hex');

      if (prevHash === self.tip.hash) {

        // This block appends to the current chain tip and we can
        // immediately add it to the chain and create indexes.

        // Populate height
        block.__height = self.tip.__height + 1;

        // Create indexes
        self._connectBlock(block, function(err) {
          if (err) {
            return done(err);
          }
          self.tip = block;
          self.log.debug('Chain added block to main chain');
          self.emit('addblock', block);
          done();
        });
      } else {
        // This block doesn't progress the current tip, so we'll attempt
        // to rewind the chain to the common ancestor of the block and
        // then we can resume syncing.
        self.log.warn('Reorg detected! Current tip: ' + self.tip.hash);
        self._disconnectTip(function(err) {
          if(err) {
            return done(err);
          }
          self.log.warn('Disconnected current tip. New tip is ' + self.tip.hash);
          done();
        });
      }
    });
  }, callback);
};

BitcoinWallet.prototype.isSynced = function() {
  return (this.tip.__height === this.node.services.bitcoind.height);
};

BitcoinWallet.prototype.sync = function() {
  var self = this;

  if (self.bitcoindSyncing || self.node.stopping || !self.tip) {
    return;
  }

  self.bitcoindSyncing = true;

  async.series([
    function(next) {
      self._initialSync(next);
    },
    function(next) {
      self._activeSync(next);
    }
  ], function(err) {
    if (err) {
      Error.captureStackTrace(err);
      return self.node.emit('error', err);
    }

    if (self.node.stopping) {
      self.bitcoindSyncing = false;
      return;
    }

    if (self.isSynced()) {
      self.bitcoindSyncing = false;
      self.node.emit('synced');
    } else {
      self.bitcoindSyncing = false;
      self.sync();
    }

  });
};

BitcoinWallet.prototype.getAPIMethods = function() {
  return [];
};

BitcoinWallet.prototype.getPublishEvents = function() {
  return [];
};

module.exports = BitcoinWallet;
