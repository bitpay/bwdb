'use strict';

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
  this.index = options.index;
  this.value = options.value;
}

WalletTxid.create = function(height, index, value) {
  var buffer = value;
  if (value && !Buffer.isBuffer(value)) {
    buffer = new Buffer(value, 'hex');
  }
  return new WalletTxid({
    height: height,
    index: index,
    value: buffer
  });
};

WalletTxid.parseKey = function(keyString) {
  // TODO instantiating a buffer directly from keyString
  // from a cursor will result in an empty buffer. Slicing
  // the string before works around this problem.
  var height = new Buffer(keyString.slice(0, 8), 'hex');
  var index = new Buffer(keyString.slice(8, 16), 'hex');
  var result = {
    height: height.readUInt32BE(0),
    index: index.readUInt32BE(0)
  };
  return result;
};

WalletTxid.prototype.getKey = function() {
  var key = new Buffer(new Array(8));
  key.writeUInt32BE(this.height);
  key.writeUInt32BE(this.index, 4);
  return key;
};

WalletTxid.prototype.getValue = function() {
  return this.value;
};

module.exports = WalletTxid;
