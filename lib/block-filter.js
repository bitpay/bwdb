'use strict';

var assert = require('assert');

var BloomFilter = require('bloom-filter');
var bitcore = require('bitcore-lib');

/**
 * This is used to discover address deltas from a block that are relevant for a wallet. It
 * will get all of the addresses from the block. Addresses are then checked against the address
 * bloom filter to determine if the address is likely relevant.
 *
 * @param {Object} options
 * @param {BloomFilter} addressFilter - The address bloom filter (with pubkey hash160 inserted)
 * @param {Network} network - A bitcore network
 */
function BlockFilter(options) {
  assert(options, 'First argument is expected to be options object');
  assert((options.addressFilter instanceof BloomFilter), 'options.addressFilter is expected to be a BloomFilter');
  assert(options.network, 'options.network is expected');
  this.addressFilter = options.addressFilter;
  this.network = options.network;
}

/**
 * Will only return the address if passes through the address filter
 *
 * @param {Object} delta
 * @param {String=} delta.address - The base58check encoded address
 */
BlockFilter.prototype.filterAddress = function(delta) {
  if (!delta.address) {
    return false;
  }
  var address = bitcore.Address(delta.address);
  if (this.addressFilter.contains(address.hashBuffer)) {
    return address;
  }
  return false;
};

BlockFilter.prototype.filterDeltas = function(block) {
  var self = this;
  return block.deltas.filter(function(transaction) {
    var found = false;

    function filterItem(item) {
      var address = self.filterAddress(item);
      if (address) {
        found = true;
      }
      return address ? true : false;
    }

    transaction.inputs = transaction.inputs.filter(filterItem);
    transaction.outputs = transaction.outputs.filter(filterItem);

    return found;
  });
};

module.exports = BlockFilter;
