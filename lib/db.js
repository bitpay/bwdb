'use strict';

var lmdb = require('node-lmdb');

var exports = {};

exports.open = function(dbPath) {
  var db = {};
  db.env = new lmdb.Env();
  db.env.open({
    path: dbPath,
    maxDbs: 10,
    mapSize: 268435456 * 4096,
    maxReaders: 126,
    noMetaSync: true,
    noSync: true
  });
  db.addresses = db.env.openDbi({
    name: 'addresses',
    create: true
  });
  db.txids = db.env.openDbi({
    name: 'txids',
    create: true
  });
  db.wallet = db.env.openDbi({
    name: 'wallet',
    create: true
  });
  db.txs = db.env.openDbi({
    name: 'txs',
    create: true
  });
  return db;
};

exports.close = function(db) {
  if (!db) {
    return db;
  }
  db.addresses.close();
  db.wallet.close();
  db.txids.close();
  db.txs.close();
  db.env.close();
  return db;
};

module.exports = exports;
