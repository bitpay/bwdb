'use strict';

var prefixes = require('../prefixes');

function WalletTxids(options) {
  if (!(this instanceof WalletTxids)) {
    return new WalletTxids(options);
  }
  if (!options) {
    options = {};
  }
  this._data = options.data || [];
}

WalletTxids.KEY = prefixes.WALLET_TXIDS;

WalletTxids.create = function(options) {
  return new WalletTxids(options);
};

WalletTxids.fromBuffer = function(buffer) {
  var data = [];
  var pos = 0;
  while (pos < buffer.length) {
    var section = buffer.slice(pos, pos + 40);
    pos += 40;
    data.push(section);
  }
  return new WalletTxids({data: data});
};

WalletTxids.prototype.toBuffer = function() {
  return Buffer.concat(this._data);
};

WalletTxids.prototype.clone = function() {
  return WalletTxids.fromBuffer(this.toBuffer());
};

/**
 * Will insert a transaction into the data structure sorted by the block
 * height and index.
 * @param {Number} height - The block height of the transaction
 * @param {Number} blockIndex - The index that the transaction is in a block
 * @param {Buffer} txid - The transaction id
 */
WalletTxids.prototype.insert = function(height, blockIndex, txid) {
  var position = new Buffer(new Array(8));
  position.writeUInt32BE(height);
  position.writeUInt32BE(blockIndex, 4);
  var lowerIndex;
  try {
    lowerIndex = this._searchLowerBound(position);
  } catch(e) {
    // TODO assert txid matches?
    return false;
  }
  var item = Buffer.concat([position, txid]);
  var pos = lowerIndex + 1;
  this._data.splice(pos, 0, item);
  return pos;
};

/**
 * Will binary search the sorted data items to find the lower bound index using
 * a position buffer of the block height and block index of a transaction.
 * @param {Buffer} positionBuffer - The first eight bytes of the item used for sorting
 */
WalletTxids.prototype._searchLowerBound = function(positionBuffer) {
  var self = this;

  function binarySearch() {
    var max = self._data.length - 2;
    var min = 0;
    while(min <= max) {
      var position = Math.floor((max + min) / 2);
      var valueCompare = self._data[position].slice(0, 8).compare(positionBuffer);
      if (valueCompare > 0) {
        max = position - 1;
      } else if (valueCompare < 0){
        min = position + 1;
      } else {
        throw new Error('Duplicate position exists');
      }
    }
    return min - 1;
  }

  if (this._data.length > 0) {
    var lastValue = this._data[this._data.length - 1].slice(0, 8);
    var lastValueCompare = lastValue.compare(positionBuffer);
    if (lastValueCompare < 0) {
      return this._data.length - 1;
    } else if (lastValueCompare > 0) {
      var lower = binarySearch();
      return lower;
    } else {
      throw new Error('Duplicate position exists');
    }
  } else {
    return 0;
  }
};

/**
 * @param {Number} from - The starting position, example: 0
 * @param {Number} to - The ending position, example: 10
 */
WalletTxids.prototype.getLatest = function(from, to) {
  var a = Math.max(this._data.length - from, 0);
  var b = Math.max(this._data.length - to, 0);
  var txids = [];
  for (; a > b; a--) {
    txids.push(this._data[a].slice(8, 40));
  }
  return txids;
};

module.exports = WalletTxids;
