'use strict';

var chai = require('chai');
var should = chai.should();
var bitcore = require('bitcore-lib');

var models = require('../../lib/models');
var WalletAddressMap = models.WalletAddressMap;

describe('Wallet Address Map Model', function() {
  var walletId1 = new Buffer('b6bf0b237e987ea9b3cc4bb6e95372554a9afb35cbb9ebc17a33e7ae9620e49e', 'hex');
  var walletId2 = new Buffer('b07d70caeaee6daf21e99cac4e9340b786a5c92f8e5f2e092f050f8c6baf3a8b', 'hex');
  function checkMap(map) {
    map.address.toString().should.equal('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
    map.walletIds[0].compare(walletId1).should.equal(0);
    map.walletIds[1].compare(walletId2).should.equal(0);
  }
  var address = '2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br';
  var walletIds = [walletId1, walletId2];
  describe('@constructor', function() {
    it('will instantiate', function() {
      var map = new WalletAddressMap(address, walletIds, bitcore.Networks.testnet);
      should.exist(map);
      checkMap(map);
    });
    it('will instantiate without new', function() {
      var map = new WalletAddressMap(address, walletIds, bitcore.Networks.testnet);
      should.exist(map);
      checkMap(map);
    });
  });
  describe('@create', function() {
    it('with buffers', function() {
      var map = WalletAddressMap.create(address, walletIds, bitcore.Networks.testnet);
      should.exist(map);
      checkMap(map);
    });
    it('with strings', function() {
      var ids = [walletId1.toString('hex'), walletId2.toString('hex')];
      var map = WalletAddressMap.create(address, ids, bitcore.Networks.testnet);
      should.exist(map);
      checkMap(map);
    });
  });
  describe('@fromBuffer', function() {
    it('will parse buffer', function() {
      var keyBuffer = new Buffer('026349a418fc4578d10a372b54b45c280cc8c4382f', 'hex');
      var value = Buffer.concat([walletId1, walletId2]); // wallet ids
      var map = WalletAddressMap.fromBuffer(keyBuffer, value, bitcore.Networks.testnet);
      map.address.toString().should.equal('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
      map.walletIds[0].compare(walletId1).should.equal(0);
      map.walletIds[1].compare(walletId2).should.equal(0);
    });
  });
  describe('@getKey', function() {
    it('will get the key', function() {
      var key = WalletAddressMap.getKey(address, bitcore.Networks.testnet);
      var expectedKey = '02'; // address type
      expectedKey += '6349a418fc4578d10a372b54b45c280cc8c4382f'; // address hash
      key.toString('hex').should.equal(expectedKey);
    });
  });
  describe('#getKey', function() {
    it('will get the key from instance', function() {
      var map = WalletAddressMap.create(address, walletIds, bitcore.Networks.testnet);
      var expectedKey = '02'; // address type
      expectedKey += '6349a418fc4578d10a372b54b45c280cc8c4382f'; // address hash
      map.getKey().toString('hex').should.equal(expectedKey);
    });
  });
  describe('#getValue', function() {
    it('will get the value from instance', function() {
      var map = WalletAddressMap.create(address, walletIds, bitcore.Networks.testnet);
      var expectedValue = 'b6bf0b237e987ea9b3cc4bb6e95372554a9afb35cbb9ebc17a33e7ae9620e49e'; // first Id
      expectedValue += 'b07d70caeaee6daf21e99cac4e9340b786a5c92f8e5f2e092f050f8c6baf3a8b';
      map.getValue().toString('hex').should.equal(expectedValue);
    });
  });
  describe('#insert', function() {
    it('will insert new wallet id', function() {
      var map = WalletAddressMap.create(address, [walletId1], bitcore.Networks.testnet);
      map.insert(walletId2);
      map.walletIds[0].compare(walletId1).should.equal(0);
      map.walletIds[1].compare(walletId2).should.equal(0);
    });
    it('will insert new wallet id as string', function() {
      var map = WalletAddressMap.create(address, [walletId1], bitcore.Networks.testnet);
      map.insert(walletId2.toString('hex'));
      map.walletIds[0].compare(walletId1).should.equal(0);
      map.walletIds[1].compare(walletId2).should.equal(0);
    });
  });
});
