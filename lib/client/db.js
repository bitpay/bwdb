'use strict';

var lmdb = require('node-lmdb');

var exports = {};

exports.open = function(dbPath, readOnly) {
  var db = {};
  db.env = new lmdb.Env();
  db.env.open({
    path: dbPath,
    maxDbs: 15,
    //TODO: figure out what the platform's pagesize is
    mapSize: 268435456 * 4096,
    maxReaders: 126,
    noMetaSync: true,
    noSync: true,
    readOnly: readOnly
  });
  db.wallets = db.env.openDbi({
    name: 'wallets',
    create: !readOnly
  });
  db.addresses = db.env.openDbi({
    name: 'addresses',
    create: !readOnly
  });
  db.keys = db.env.openDbi({
    name: 'keys',
    create: !readOnly
  });
};

exports.close = function(db) {
  if (!db) {
    return db;
  }
  db.wallets.close();
  db.addresses.close();
  db.keys.close();
  return db;
};

module.exports = exports;
