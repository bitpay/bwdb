'use strict';

var chai = require('chai');
var should = chai.should();

var models = require('../../lib/models');
var BloomFilter = require('bloom-filter');
var Wallet = models.Wallet;

describe('Wallet Data Model', function() {
  var walletId = new Buffer('7e5a548623edccd9e18c4e515ba5e7380307f28463b4b90ea863aa34efa22a6d', 'hex');
  describe('@constructor', function() {
    it('will set properties', function() {
      var wallet = new Wallet(walletId, {
        addressFilter: {
          vData: new Array([0, 1]),
          nHashFuncs: 3,
          nTweak: false,
          nFlags: 0,
          noMaxSize: true
        },
        balance: 100000000
      });
      wallet.addressFilter.should.be.instanceOf(BloomFilter);

      wallet.id.compare(walletId).should.equal(0);
      wallet.balance.should.equal(100000000);
    });
    it('will set properties using string', function() {
      var wallet = new Wallet(walletId.toString('hex'), {
        addressFilter: {
          vData: new Array([0, 1]),
          nHashFuncs: 3,
          nTweak: false,
          nFlags: 0,
          noMaxSize: true
        },
        balance: 100000000
      });
      wallet.addressFilter.should.be.instanceOf(BloomFilter);

      wallet.id.compare(walletId).should.equal(0);
      wallet.balance.should.equal(100000000);
    });
    it('will create a new empty bloom filter and zero balance', function() {
      var wallet = new Wallet(walletId);
      wallet.addressFilter.should.be.instanceOf(BloomFilter);
      wallet.addressFilter.vData.length.should.equal(3594396);
      wallet.balance.should.equal(0);
    });
    it('will create without "new"', function() {
      /* jshint newcap: false */
      var wallet = Wallet(walletId);
      wallet.addressFilter.should.be.instanceOf(BloomFilter);
      wallet.addressFilter.vData.length.should.equal(3594396);
      wallet.balance.should.equal(0);
    });
    it('will error non-number height', function() {
      (function() {
        var wallet = new Wallet({
          height: 'notaheight'
        });
      }).should.throw(Error);
    });
    it('will error with non-buffer blockHash', function() {
      (function() {
        var wallet = new Wallet({
          height: 100,
          blockHash: 'notablockhash'
        });
      }).should.throw(Error);
    });
  });
  describe('@create', function() {
    it('will set properties', function() {
      var wallet = Wallet.create(walletId, {
        addressFilter: {
          vData: new Array([0, 1]),
          nHashFuncs: 3,
          nTweak: false,
          nFlags: 0,
          noMaxSize: true
        },
        balance: 100000000
      });
      wallet.addressFilter.should.be.instanceOf(BloomFilter);

      wallet.id.compare(walletId).should.equal(0);
      wallet.balance.should.equal(100000000);
    });
  });
  describe('#getKey', function() {
    it('will get the correct key', function() {
      var wallet = new Wallet(walletId, {
        addressFilter: {
          vData: new Array([0, 1]),
          nHashFuncs: 3,
          nTweak: false,
          nFlags: 0,
          noMaxSize: true
        },
        balance: 100000000
      });
      var key = wallet.getKey('hex');
      walletId.toString('hex').should.equal(key.toString('hex'));
      key = wallet.getKey();
      walletId.compare(key).should.equal(0);
    });
  });
  describe('#addBalance', function() {
    it('will add balance to a wallet', function() {
      var wallet = new Wallet(walletId, {
        addressFilter: {
          vData: new Array([0, 1]),
          nHashFuncs: 3,
          nTweak: false,
          nFlags: 0,
          noMaxSize: true
        },
        balance: 100000000
      });
      var oldBalance = wallet.balance;
      wallet.addBalance(500);
      wallet.balance.should.equal(oldBalance + 500);
    });
  });
  describe('#getValue', function() {
    it('roundtrip', function() {
      var wallet = new Wallet(walletId);
      wallet.addressFilter.insert(new Buffer('abcdef', 'hex'));
      wallet.addressFilter.contains(new Buffer('abcdef', 'hex')).should.equal(true);
      wallet.balance.should.equal(0);
      var wallet2 = Wallet.fromBuffer(walletId, wallet.getValue());
      wallet2.addressFilter.contains(new Buffer('abcdef', 'hex')).should.equal(true);
    });
  });
  describe('#clone', function() {
    it('will have the same height and address filter', function() {
      var wallet = new Wallet(walletId);
      wallet.addressFilter.insert(new Buffer('abcdef', 'hex'));
      wallet.addressFilter.contains(new Buffer('abcdef', 'hex')).should.equal(true);
      wallet.balance.should.equal(0);
      var wallet2 = wallet.clone();
      wallet2.addressFilter.contains(new Buffer('abcdef', 'hex')).should.equal(true);
    });
    it('will not create references', function() {
      var wallet = new Wallet(walletId);
      var wallet2 = wallet.clone();
      should.equal(wallet2.id === walletId, false);
    });
  });
});
