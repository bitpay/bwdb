'use strict';

var log = require('npmlog');
log.debug = log.verbose;
log.disableColor();
var BufferUtil = require('bitcore-lib').util.buffer;

var mongodb = require('mongodb');

var Model = require('./model');

var collections = {
  ADDRESSES: 'addresses',
  WALLET_TRANSACTIONS: 'wallet_transactions',
  BLOCKS: 'blocks'
};

var Storage = function(opts) {
  opts = opts || {};
  this.db = opts.db;
};

Storage.prototype._createIndexes = function() {
/*
  this.db.collection(collections.ADDRESSES).createIndex({
    walletId: 1,
    createdOn: 1,
  });

  this.db.collection(collections.ADDRESSES).createIndex({
    address: 1,
  });

  this.db.collection(collections.WALLET_TRANSACTIONS).createIndex({
    walletId: 1,
    blockHeight: 1,
    network: 1,
    receiving: 1
  });

  this.db.collection(collections.BLOCKS).createIndex({
    height: 1,
    network: 1
  }, {unique: true});


  this.db.collection(collections.ADDRESSES).dropIndex({
    walletId: 1
  });
*/
};

Storage.prototype.connect = function(opts, cb) {
  var self = this;

  opts = opts || {};

  if (this.db) return cb();

  var config = opts.mongoDb || {};
  mongodb.MongoClient.connect(config.uri, function(err, db) {
    if (err) {
      log.error('Unable to connect to the mongoDB server on ', config.uri);
      return cb(err);
    }
    self.db = db;
    self._createIndexes();
    console.log('Connection established to ', config.uri);
    return cb();
  });
};


Storage.prototype.disconnect = function(cb) {
  var self = this;
  this.db.close(true, function(err) {
    if (err) return cb(err);
    self.db = null;
    return cb();
  });
};

Storage.prototype.fetchAddressesForBlockHandler = function(addresses, callback) {
  this.db.collection(collections.ADDRESSES).find({
    address: {$in: addresses}
  }, {
    walletId: 1,
    address: 1,
    _id: 0
  }).toArray(callback);
};

Storage.prototype.storeWalletTransaction = function(walletTransaction, callback) {
  // this.db.collection(collections.WALLET_TRANSACTIONS).update({
  //   walletId: walletTransaction.walletId,
  //   txid: walletTransaction.txid,
  //   receiving: walletTransaction.receiving
  // }, walletTransaction.toObject(), {
  //   w: 1,
  //   upsert: true
  // }, callback);

  this.db.collection(collections.WALLET_TRANSACTIONS).insert(walletTransaction.toObject(), {w: 1}, callback);
};

Storage.prototype.findWalletTransactions = function(walletId, skip, limit, callback) {
  var query = this.db.collection(collections.WALLET_TRANSACTIONS).find({walletId: walletId}).sort({blockHeight: -1})
    .skip(skip).limit(limit);

  query.toArray(function(err, walletTransactions) {
    if (err) {
      return callback(err);
    }

    var walletTransactionObjects = walletTransactions.map(function(walletTransaction) {
      return Model.WalletTransaction.create(walletTransaction);
    });

    callback(null, walletTransactionObjects);
  });
};

Storage.prototype.removeWalletTransactionsAtBlockHeight = function(blockHeight, network, callback) {
  this.db.collection(collections.WALLET_TRANSACTIONS).remove({blockHeight: blockHeight, network: network}, callback);
};

Storage.prototype.getLatestBlock = function(network, callback) {
  /**
  * Using .toArray() and picking the first element is kinda hacky. We must do this because we use tingodb for tests,
  * and tingodb does not support cursor.next(), which is what we really should be using here. We will do it this way for
  * now, and change this to use .next() when tingodb adds support for it.
  * see https://github.com/sergeyksv/tingodb/issues/115
  */
  this.db.collection(collections.BLOCKS).find({network: network}).sort({height: -1}).limit(1).toArray(function(err, blocks) {
    if (err) {
      return callback(err);
    }

    if (!blocks[0]) {
      return callback();
    }

    callback(null, Model.Block.create(blocks[0]));
  });
};

Storage.prototype.deleteBlock = function(blockHeight, network, callback) {
  // cannot use .remove() with capped collection
  this.db.collection(collections.BLOCKS).remove({height: blockHeight, network: network}, callback);
};

Storage.prototype.finishBlock = function(blockHeight, network, callback) {
  this.db.collection(collections.BLOCKS).update({height: blockHeight, network: network},
    {$set: {finished: true}}, function(err) {
    if (err) {
      return callback(err);
    }

    callback();
  });
};

Storage.prototype.startRemovingBlock = function(blockHeight, network, callback) {
  this.db.collection(collections.BLOCKS).update({
    height: blockHeight,
    network: network
  }, {
    $set: {action: 'removing', finished: false}
  }, function(err) {
    if (err) {
      return callback(err);
    }

    callback();
  });
};

// block is not a BWS block object. it is a bitcore block object + height attribute
// inserts new block with {action: 'adding', finished: false}
Storage.prototype.addBlock = function(block, network, callback) {

  // we have to reverse the endianess on the prevHash so it will look like the normal hash
  // prevHash is also a buffer instead of a string. This will likely be fixed in a future version of bitcore
  var previousHash = BufferUtil.reverse(block.header.prevHash).toString('hex');

  var blockParams = {
    hash: block.hash,
    previousHash: previousHash,
    height: block.height,
    network: network
  };

  block = Model.Block.create(blockParams);
  block.action = 'adding';
  block.finished = false;

  this.db.collection(collections.BLOCKS).update({
    height: block.height,
    network: network
  }, block.toObject(), {
    w: 1,
    upsert: true
  }, callback);
};

Storage.collections = collections;
module.exports = Storage;
