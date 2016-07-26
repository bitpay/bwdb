'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');

var utils = require('../utils');

/**
 * Search for UTXOS by walletId, txid and index
 * @param {Object} walletId
 * @param {Object} options
 */
function WalletUTXO(walletId, options) {
  if (!(this instanceof WalletUTXO)) {
    return new WalletUTXO(walletId, options);
  }
  this.walletId = WalletUTXO._initWalletId(walletId);
  this.address = new bitcore.Address(options.address);
  this.satoshis = options.satoshis;
  this.height = options.height;
  this.txid = options.txid;
  this.index = options.index;
}

WalletUTXO._initWalletId = function(walletId) {
  var walletIdBuf;
  if (Buffer.isBuffer(walletId)) {
    assert(walletId.length === 32, '"id" buffer is expected to be 32 bytes');
    walletIdBuf = walletId;
  } else {
    assert(bitcore.util.js.isHexa(walletId), '"id" is expected to be a hexa string if not a buffer');
    assert(walletId.length === 64, '"id" string is expected to have length of 64');
    walletIdBuf = new Buffer(walletId, 'hex');
  }
  return walletIdBuf;
};

WalletUTXO.create = function(walletId, options) {
  // TODO validation
  return new WalletUTXO(walletId, options);
};

WalletUTXO.fromBuffer = function(key, value, network) {
  var keyBuf = key;
  if (!Buffer.isBuffer(key)) {
    keyBuf = new Buffer(key, 'hex');
  }

  var walletId = keyBuf.slice(0, 32);
  var txid = keyBuf.slice(32, 64);
  var index = keyBuf.readUInt32BE(64);

  var height = value.readUInt32BE(0); // read 4 bytes
  var satoshis = value.readDoubleBE(4); // read 8 bytes

  var typeBuf = value.slice(12, 13);
  var type = utils.getAddressTypeString(typeBuf);
  var hashBuffer = value.slice(13, 33);

  return new WalletUTXO(walletId, {
    satoshis: satoshis,
    address: new bitcore.Address({type: type, hashBuffer: hashBuffer, network: network}),
    height: height,
    index: index,
    txid: txid
  });
};

WalletUTXO.getKey = function(walletId, txid, index, encoding) {
  var walletIdBuf = WalletUTXO._initWalletId(walletId);

  var txidBuf = txid;
  if (!Buffer.isBuffer(txid)) {
    txidBuf = new Buffer(txid, 'hex');
  }

  var buffer = new Buffer(new Array(4));
  buffer.writeUInt32BE(index);

  var key = Buffer.concat([walletIdBuf, txidBuf, buffer]);
  if (encoding === 'hex') {
    return key.toString('hex');
  }
  return key;
};

WalletUTXO.prototype.getKey = function(encoding) {
  return WalletUTXO.getKey(this.walletId, this.txid, this.index, encoding);
};

WalletUTXO.prototype.getValue = function() {
  var buffer = new Buffer(new Array(12));
  assert(this.height >= 0);
  buffer.writeUInt32BE(this.height);
  assert(this.satoshis >= 0);
  buffer.writeDoubleBE(this.satoshis, 4);

  var type = utils.getAddressTypeBuffer(this.address);

  return Buffer.concat([buffer, type, this.address.hashBuffer]);
};

WalletUTXO.prototype.toJSON = WalletUTXO.prototype.toObject = function() {
  return {
    walletId: this.walletId.toString('hex'),
    address: this.address.toString(),
    satoshis: this.satoshis,
    height: this.height,
    txid: this.txid.toString('hex'),
    index: this.index
  };
};

module.exports = WalletUTXO;
