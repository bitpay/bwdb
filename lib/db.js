'use strict';

var lmdb = require('node-lmdb');

var exports = {};

exports.open = function(dbPath, readOnly) {
  var db = {};
  db.env = new lmdb.Env();
  db.env.open({
    path: dbPath,
    maxDbs: 10,
    mapSize: 268435456 * 4096,
    maxReaders: 126,
    noMetaSync: true,
    noSync: true,
    readOnly: readOnly
  });
  db.addresses = db.env.openDbi({
    name: 'addresses',
    create: !readOnly
  });
  db.txids = db.env.openDbi({
    name: 'txids',
    create: !readOnly
  });
  db.wallet = db.env.openDbi({
    name: 'wallet',
    create: !readOnly
  });
  db.txs = db.env.openDbi({
    name: 'txs',
    create: !readOnly
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
