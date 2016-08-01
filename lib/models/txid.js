'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');

/**
 * @param {Buffer} walletId - The wallet id
 * @param {Object} options
 * @param {Number} options.height - The block height of the txid
 * @param {Number} options.index - The transaction index in the block
 * @param {Buffer} optinos.value - The transaction id
 */
function WalletTxid(walletId, options) {
  if (!(this instanceof WalletTxid)) {
    return new WalletTxid(walletId, options);
  }
  if (!options) {
    options = {};
  }
  this._initWalletId(walletId);
  this.height = options.height;
  this.index = options.index;
  if (options.value && !Buffer.isBuffer(options.value)) {
    this.value = new Buffer(options.value, 'hex');
  } else {
    this.value = options.value;
  }
}

WalletTxid.prototype._initWalletId = function(walletId) {
  if (Buffer.isBuffer(walletId)) {
    assert(walletId.length === 32, '"id" buffer is expected to be 32 bytes');
    this.walletId = walletId;
  } else {
    assert(bitcore.util.js.isHexa(walletId), '"id" is expected to be a hexa string if not a buffer');
    assert(walletId.length === 64, '"id" string is expected to have length of 64');
    this.walletId = new Buffer(walletId, 'hex');
  }
};

WalletTxid.create = function(walletId, height, index, value) {
  return new WalletTxid(walletId, {
    height: height,
    index: index,
    value: value
  });
};

WalletTxid.parseKey = function(keyString) {
  var walletId = keyString.slice(0, 64);
  var height = new Buffer(keyString.slice(64, 72), 'hex');
  var index = new Buffer(keyString.slice(72, 80), 'hex');
  var result = {
    walletId: walletId,
    height: height.readUInt32BE(0),
    index: index.readUInt32BE(0)
  };
  return result;
};

WalletTxid.prototype.getKey = function(encoding) {
  var buffer = new Buffer(new Array(8));
  buffer.writeUInt32BE(this.height);
  buffer.writeUInt32BE(this.index, 4);
  var key = Buffer.concat([this.walletId, buffer]);
  if (encoding === 'hex') {
    return key.toString('hex');
  }
  return key;
};

WalletTxid.prototype.getValue = function() {
  return this.value;
};

module.exports = WalletTxid;
