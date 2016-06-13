'use strict';

var fs = require('fs');
var inherits = require('util').inherits;
var path = require('path');
var EventEmitter = require('events').EventEmitter;

var async = require('async');
var bitcore = require('bitcore-lib');
var Block = bitcore.Block;
var BufferUtil = bitcore.util.buffer;
var mkdirp = require('mkdirp');
var leveldown = require('leveldown');

var models = require('./models');

function BitcoinWallet(options) {
  EventEmitter.call(this);
  this.node = options.node;
  this.log = this.node.log;
  this.db = null;
  this.tip = null;
  this.blockHandler = null;
}
inherits(BitcoinWallet, EventEmitter);

BitcoinWallet.dependencies = ['bitcoind'];

BitcoinWallet.PREFIXES = {
  KEY: new Buffer('00', 'hex'),
  TRANSACTION: new Buffer('01', 'hex'),
  BLOCK: new Buffer('02', 'hex')
};

BitcoinWallet.prototype._getApplicationDir = function() {
  var appPath = path.resolve(process.env.HOME, './.bwsv2');
  return appPath;
};

BitcoinWallet.prototype._setupApplicationDirectory = function(callback) {
  var appPath = this._getApplicationDir();
  fs.access(appPath, function(err) {
    if (err && err.code === 'ENOENT') {
      return mkdirp(appPath, callback);
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
    databasePath = path.resolve(appPath, './wallet-livenet.db');
  } else if (this.node.network === bitcore.Networks.testnet) {
    if (this.node.network.regtestEnabled) {
      databasePath = path.resolve(appPath, './wallet-regtest.db');
    } else {
      databasePath = path.resolve(appPath, './wallet-testnet3.db');
    }
  } else {
    throw new Error('Unknown network: ' + this.network);
  }
  return databasePath;
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
      self._setupApplicationDirectory(next);
    },
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
    this.db.close(callback);
  } else {
    setImmediate(callback);
  }
};

BitcoinWallet.prototype._connectBlock = function(block, callback) {
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

  // TODO self._initialSync(next);
  // TODO self._activeSync(next);

  async.series([
    function(next) {
      setImmediate(next);
    },
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

/**
 * @param {Object} key
 * @param {String} key.address - The base58 encoded address
 * @param {String} key.privateKey - The hex string of the private key
 * @param {String} key.publicKey - The hex string for the public key
 */
BitcoinWallet.prototype.importKey = function(key, callback) {
  var address = bitcore.Address(key.address);
  var keyModel = models.WalletKey(key);
  var dbKey = address.hashBuffer;
  // TODO include type of address and prefix
  // TODO check value doesn't already exist
  this.db.put(dbKey, keyModel.toBuffer(), function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, dbKey);
  });
};

/**
 * Adds keypairs and addresses to the wallet.
 * [
 *   {
 *     "address": "mmpY9Nt4pRC5gfjezYn3pByaJCUTGo1Foe",
 *     "privateKey": "906977a061af29276e40bf377042ffbde414e496ae2260bbf1fa9d085637bfff",
 *     "publicKey": "02a1633cafcc01ebfb6d78e39f687a1f0995c62fc95f51ead10a02ee0be551b5dc",
 *   }
 * ]
 */
BitcoinWallet.prototype.importKeys = function(keys, callback) {
  var self = this;
  async.mapLimit(keys, 5, function(key, next) {
    self.importKey(key, next);
  }, function(err, results) {
    if (err) {
      return callback(err);
    }
    callback(null, results);
  });
};

BitcoinWallet.prototype.getAPIMethods = function() {
  var methods = [
    ['importKeys', this, this.importKeys, 1]
  ];
  return methods;
};

BitcoinWallet.prototype.getPublishEvents = function() {
  return [];
};

module.exports = BitcoinWallet;
