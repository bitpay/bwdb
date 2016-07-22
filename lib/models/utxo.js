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
    return new WalletUTXO(options);
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
  var walletId = key.slice(0, 32);
  var txid = key.slice(32, 64);
  var index = key.readUInt32BE(64);

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
  var buffer = new Buffer(new Array(4));
  buffer.writeUInt32BE(index);
  var txidBuf = txid;

  if (!Buffer.isBuffer(txid)) {
    txidBuf = new Buffer(txid, 'hex');
  }

  var walletIdBuf = WalletUTXO._initWalletId(walletId);

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
  var type = utils.getAddressTypeBuffer(this.address);
  var buffer = new Buffer(new Array(12));
  buffer.writeUInt32BE(this.height);
  buffer.writeDoubleBE(this.satoshis);
  return Buffer.concat([buffer, type, this.address.hashBuffer]);
};

module.exports = WalletUTXO;
