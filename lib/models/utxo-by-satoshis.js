'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');

var utils = require('../utils');

/**
 * Search for UTXOS by walletId and satoshis
 * @param {Object} walletId
 * @param {Object} options
 */
function WalletUTXOBySatoshis(walletId, options) {
  if (!(this instanceof WalletUTXOBySatoshis)) {
    return new WalletUTXOBySatoshis(walletId, options);
  }
  this.walletId = WalletUTXOBySatoshis._initWalletId(walletId);
  this.address = new bitcore.Address(options.address);
  this.satoshis = options.satoshis;
  this.height = options.height;

  this.txid = options.txid;
  if (!Buffer.isBuffer(options.txid)) {
    this.txid = new Buffer(options.txid, 'hex');
  }
  this.index = options.index;
}

WalletUTXOBySatoshis._initWalletId = function(walletId) {
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

WalletUTXOBySatoshis.create = function(walletId, options) {
  // TODO validation
  return new WalletUTXOBySatoshis(walletId, options);
};

WalletUTXOBySatoshis.fromBuffer = function(key, value, network) {
  var keyBuf = key;
  if (!Buffer.isBuffer(key)) {
    keyBuf = new Buffer(key, 'hex');
  }

  var walletId = keyBuf.slice(0, 32);
  var satoshis = keyBuf.readDoubleBE(32);
  var txid = keyBuf.slice(32, 64);

  var index = value.readUInt32BE(64); // read 4 bytes
  var height = value.readUInt32BE(0); // read 4 bytes

  var typeBuf = value.slice(4, 5);
  var type = utils.getAddressTypeString(typeBuf);
  var hashBuffer = value.slice(5, 25);

  return new WalletUTXOBySatoshis(walletId, {
    satoshis: satoshis,
    address: new bitcore.Address({type: type, hashBuffer: hashBuffer, network: network}),
    height: height,
    index: index,
    txid: txid
  });
};

WalletUTXOBySatoshis.getKey = function(walletId, satoshis, txid, index, encoding) {
  var walletIdBuf = WalletUTXOBySatoshis._initWalletId(walletId);

  var satoshiBuffer = new Buffer(new Array(8));
  satoshiBuffer.writeDoubleBE(satoshis);

  var txidBuf = txid;
  if (!Buffer.isBuffer(txid)) {
    txidBuf = new Buffer(txid, 'hex');
  }

  var indexBuffer = new Buffer(new Array(4));
  indexBuffer.writeUInt32BE(index);

  var key = Buffer.concat([walletIdBuf, satoshiBuffer, txidBuf, indexBuffer]);

  if (encoding === 'hex') {
    return key.toString('hex');
  }

  return key;
};

WalletUTXOBySatoshis.prototype.getKey = function(encoding) {
  return WalletUTXOBySatoshis.getKey(this.walletId, this.satoshis, this.txid, this.index, encoding);
};

WalletUTXOBySatoshis.prototype.getValue = function() {
  var buffer = new Buffer(new Array(4));
  buffer.writeUInt32BE(this.height);

  var type = utils.getAddressTypeBuffer(this.address);

  return Buffer.concat([buffer, type, this.address.hashBuffer]);
};

WalletUTXOBySatoshis.prototype.toJSON = WalletUTXOBySatoshis.prototype.toObject = function() {
  return {
    walletId: this.walletId.toString('hex'),
    address: this.address.toString(),
    satoshis: this.satoshis,
    height: this.height,
    txid: this.txid.toString('hex'),
    index: this.index
  };
};

module.exports = WalletUTXOBySatoshis;
