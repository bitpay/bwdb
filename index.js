'use strict';

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var MongoClient = require('mongodb').MongoClient;
var bitcore = require('bitcore-lib');
var async = require('async');
var Block = bitcore.Block;
var BufferUtil = bitcore.util.buffer;

var BlockHandler = require('./lib/blockHandler');

function MongoWallet(options) {
  EventEmitter.call(this);
  this.node = options.node;
  this.databaseURL = options.databaseURL;
  this.db = null;
  this.tip = null;
  this.blockHandler = null;
}
inherits(MongoWallet, EventEmitter);

MongoWallet.dependencies = ['bitcoind'];

MongoWallet.prototype._connectMongo = function(callback) {
  var self = this;
  MongoClient.connect(self.databaseURL, function(err, db) {
    if (err) {
      return callback(err);
    }
    self.db = db;
    callback();
  });
};

MongoWallet.prototype.start = function(callback) {
  var self = this;

  self.blockHandler = new BlockHandler({}); // pass in network and db

  async.series([
    function(next) {
      self._connectMongo(next);
    },
    function(next) {
      self._initializeTip(next);
    }
  ], function(err) {
    if (err) {
      return callback(err);
    }

    self.emit('ready');
    self.log.info('Mongo Wallet Ready');
    self.sync();

    self.node.services.bitcoind.on('tip', function() {
      if(!self.node.stopping) {
        self.sync();
      }
    });
    callback();
  });

};

MongoWallet.prototype.stop = function(callback) {
  if (this.db) {
    this.db.close();
  }
  setImmediate(callback);
};

MongoWallet.prototype._connectBlock = function(block, callback) {
  var self = this;

  startRemovingBlock(block.height, function(err) {//storage method
    if (err) {
      return calback(err);
    }

    self.blockHandler.handleRemoveBlock({height: block.height}, function(err) {
      if (err) {
        return callback(err);
      }

      finishBlock(block.height, self.network, function(err) {//storage method
        if (err) {
          return callback(err);
        }

        deleteBlock(block.height, self.network, callback);//storage method
      });
    });
  });
};

MongoWallet.prototype._disconnectTip = function(callback) {
  setImmediate(callback);
};

MongoWallet.prototype._initializeTip = function(callback) {
  setImmediate(callback);
};

MongoWallet.prototype._initialSync = function(callback) {
  setImmediate(callback);
};

MongoWallet.prototype._activeSync = function(callback) {
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

MongoWallet.prototype.isSynced = function() {
  return (this.tip.__height === this.node.services.bitcoind.height);
};

MongoWallet.prototype.sync = function() {
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

MongoWallet.prototype.getAPIMethods = function() {
  return [];
};

MongoWallet.prototype.getPublishEvents = function() {
  return [];
};

module.exports = MongoWallet;
