'use strict';

var assert = require('assert');
var bitcore = require('bitcore-lib');

/**
 * @param {Object} options
 * @param {Array} options.data - An array of buffers
 */
function WalletTxid(walletId, options) {
  if (!(this instanceof WalletTxid)) {
    return new WalletTxid(options);
  }
  if (!options) {
    options = {};
  }
  this._initWalletId(walletId);
  this.height = options.height;
  this.index = options.index;
  this.value = options.value;
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
  var buffer = value;
  if (value && !Buffer.isBuffer(value)) {
    buffer = new Buffer(value, 'hex');
  }
  return new WalletTxid(walletId, {
    height: height,
    index: index,
    value: buffer
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
