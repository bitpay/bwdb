'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');

var utils = require('../utils');

/**
 * Search for UTXOS by walletId and height
 * @param {Object} walletId
 * @param {Object} options
 */
function WalletUTXOByHeight(walletId, options) {
  if (!(this instanceof WalletUTXOByHeight)) {
    return new WalletUTXOByHeight(walletId, options);
  }
  this.walletId = WalletUTXOByHeight._initWalletId(walletId);
  this.address = new bitcore.Address(options.address);
  this.satoshis = options.satoshis;
  this.height = options.height;
  this.txid = options.txid;
  if (!Buffer.isBuffer(options.txid)) {
    this.txid = new Buffer(options.txid, 'hex');
  }
  this.index = options.index;
}

WalletUTXOByHeight._initWalletId = function(walletId) {
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

WalletUTXOByHeight.create = function(walletId, options) {
  // TODO validation
  return new WalletUTXOByHeight(walletId, options);
};

WalletUTXOByHeight.fromBuffer = function(key, value, network) {
  var keyBuf = key;
  if (!Buffer.isBuffer(key)) {
    keyBuf = new Buffer(key, 'hex');
  }

  var walletId = keyBuf.slice(0, 32);
  var height = keyBuf.readUInt32BE(32);
  var txid = keyBuf.slice(32, 64);
  var index = keyBuf.readUInt32BE(64); // read 4 bytes

  var satoshis = value.readDoubleBE(0); // read 8 bytes

  var typeBuf = value.slice(8, 9);
  var type = utils.getAddressTypeString(typeBuf);
  var hashBuffer = value.slice(9, 29);

  return new WalletUTXOByHeight(walletId, {
    satoshis: satoshis,
    address: new bitcore.Address({type: type, hashBuffer: hashBuffer, network: network}),
    height: height,
    index: index,
    txid: txid
  });
};

WalletUTXOByHeight.getKey = function(walletId, height, txid, index, encoding) {
  var walletIdBuf = WalletUTXOByHeight._initWalletId(walletId);

  var heightBuffer = new Buffer(new Array(4));
  heightBuffer.writeUInt32BE(height);

  var txidBuf = txid;
  if (!Buffer.isBuffer(txid)) {
    txidBuf = new Buffer(txid, 'hex');
  }

  var indexBuffer = new Buffer(new Array(4));
  indexBuffer.writeUInt32BE(index);

  var key = Buffer.concat([walletIdBuf, heightBuffer, txidBuf, indexBuffer]);
  if (encoding === 'hex') {
    return key.toString('hex');
  }
  return key;
};

WalletUTXOByHeight.prototype.getKey = function(encoding) {
  return WalletUTXOByHeight.getKey(this.walletId, this.height, this.txid, this.index, encoding);
};

WalletUTXOByHeight.prototype.getValue = function() {
  var buffer = new Buffer(new Array(8));
  buffer.writeDoubleBE(this.satoshis);
  var type = utils.getAddressTypeBuffer(this.address);
  return Buffer.concat([buffer, type, this.address.hashBuffer]);
};

WalletUTXOByHeight.prototype.toJSON = WalletUTXOByHeight.prototype.toObject = function() {
  return {
    walletId: this.walletId.toString('hex'),
    address: this.address.toString(),
    satoshis: this.satoshis,
    height: this.height,
    txid: this.txid.toString('hex'),
    index: this.index
  };
};

module.exports = WalletUTXOByHeight;
