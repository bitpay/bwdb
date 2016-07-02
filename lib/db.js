'use strict';

var lmdb = require('node-lmdb');

var exports = {};

exports.open = function(dbPath, readOnly) {
  var db = {};
  db.env = new lmdb.Env();
  db.env.open({
    path: dbPath,
    maxDbs: 15,
    mapSize: 268435456 * 4096,
    maxReaders: 126,
    noMetaSync: true,
    noSync: true,
    readOnly: readOnly
  });
  db.addressesMap = db.env.openDbi({
    name: 'addressesMap',
    create: !readOnly
  });
  db.addresses = db.env.openDbi({
    name: 'addresses',
    create: !readOnly
  });
  db.txids = db.env.openDbi({
    name: 'txids',
    create: !readOnly
  });
  db.wallets = db.env.openDbi({
    name: 'wallets',
    create: !readOnly
  });
  db.blocks = db.env.openDbi({
    name: 'blocks',
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
  db.addressesMap.close();
  db.addresses.close();
  db.wallets.close();
  db.txids.close();
  db.txs.close();
  db.blocks.close();
  db.env.close();
  return db;
};

module.exports = exports;
