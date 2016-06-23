'use strict';

var assert = require('assert');

/**
 * @param {Object} options
 * @param {Array} options.data - An array of buffers
 */
function WalletTxid(options) {
  if (!(this instanceof WalletTxid)) {
    return new WalletTxid(options);
  }
  if (!options) {
    options = {};
  }
  this.height = options.height;
  this.blockIndex = options.blockIndex;
  this.value = options.value;
}

WalletTxid.create = function(height, blockIndex, value) {
  var buffer = value;
  if (value && !Buffer.isBuffer(value)) {
    buffer = new Buffer(value, 'hex');
  }
  return new WalletTxid({
    height: height,
    blockIndex: blockIndex,
    value: buffer
  });
};

WalletTxid.prototype.getKey = function() {
  var key = new Buffer(new Array(8));
  key.writeUInt32BE(this.height);
  key.writeUInt32BE(this.blockIndex, 4);
  return key;
};

WalletTxid.prototype.getValue = function() {
  return this.value;
};

module.exports = WalletTxid;
