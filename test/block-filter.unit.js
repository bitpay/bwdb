'use strict';

var chai = require('chai');
var should = chai.should();
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');

var blockDeltas = require('./data/block-deltas.json');
var BlockFilter = require('../lib/block-filter');

describe('Wallet Block Filter', function() {
  describe('@constructor', function() {
    it('will construct new object', function() {
      var filter = new BlockFilter({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      should.exist(filter);
      should.exist(filter.addressFilter);
      should.exist(filter.addressFilter.insert);
      should.exist(filter.addressFilter.contains);
      filter.network.should.equal(bitcore.Networks.testnet);
    });
  });
  describe('#filterDeltas', function() {
    it('will return the filtered deltas with addresses that match', function() {
      var filter = new BlockFilter({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      blockDeltas[0].addresses.forEach(function(address) {
        filter.addressFilter.insert(bitcore.Address(address).hashBuffer);
      });
      var transactions = filter.filterDeltas(blockDeltas[0].deltas);
      transactions.should.deep.equal(blockDeltas[0].expected);
    });
    it('return empty array', function() {
      var filter = new BlockFilter({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      var transactions = filter.filterDeltas(blockDeltas[0].deltas);
      transactions.should.deep.equal([]);
    });
  });
  describe('#filterAddress', function() {
    it('will return false if address property not defined', function() {
      var filter = new BlockFilter({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      filter.filterAddress({}).should.equal(false);
    });
  });
});
