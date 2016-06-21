'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var bitcore = require('bitcore-lib');

var BlockHandler = require('../lib/block-handler');
var BloomFilter = require('bloom-filter');

describe('Wallet Block Handler', function() {
  describe('@constructor', function() {
    it('will construct new object', function() {
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      should.exist(handler);
    });
  });
  describe('#getAddressFromOutput', function() {
    it('will handle a null script', function() {
    });
    it('will find address but filter it out', function() {
    });
    it('will find address and keep it', function() {
    });
  });
  describe('#getAddressFromInput', function() {
    it('will handle a null script', function() {
    });
    it('will find address but filter it out', function() {
    });
    it('will find address and keep it', function() {
    });
  });
  describe('#getAddressDeltasFromOutputs', function() {
    it('will iterate over outputs of a transaction and build delta info', function() {
    });
  });
  describe('#getAddressDeltasFromInputs', function() {
    it('will iterate over inputs of a transaction and build delta info', function() {
    });
  });
  describe('#buildAddressDeltaList', function() {
    it('will build array grouped by address', function() {
    });
  });
});
