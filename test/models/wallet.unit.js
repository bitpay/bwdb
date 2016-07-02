'use strict';

var chai = require('chai');
var should = chai.should();

var models = require('../../lib/models');
var BloomFilter = require('bloom-filter');
var Wallet = models.Wallet;

describe.skip('Wallet Data Model', function() {
  describe('@constructor', function() {
    it('will set properties', function() {
      var blockHash = new Buffer('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f', 'hex');
      var wallet = new Wallet({
        height: 100,
        blockHash: blockHash,
        addressFilter: {
          vData: new Array([0, 1]),
          nHashFuncs: 3,
          nTweak: false,
          nFlags: 0,
          noMaxSize: true
        },
        balance: 100000000
      });
      wallet.height.should.equal(100);
      wallet.addressFilter.should.be.instanceOf(BloomFilter);

      wallet.blockHash.should.equal(blockHash);
      wallet.balance.should.equal(100000000);
    });
    it('will create a new empty bloom filter and zero balance', function() {
      var wallet = new Wallet({
        height: 100,
        blockHash: new Buffer('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f', 'hex')
      });
      wallet.addressFilter.should.be.instanceOf(BloomFilter);
      wallet.addressFilter.vData.length.should.equal(11981322);
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
  describe('#toBuffer/#fromBuffer', function() {
    it('roundtrip', function() {
      var wallet = new Wallet({
        height: 100,
        blockHash: new Buffer('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f', 'hex')
      });
      wallet.addressFilter.insert(new Buffer('abcdef', 'hex'));
      wallet.addressFilter.contains(new Buffer('abcdef', 'hex')).should.equal(true);
      wallet.balance.should.equal(0);
      var wallet2 = Wallet.fromBuffer(wallet.toBuffer());
      wallet2.height.should.equal(100);
      wallet2.addressFilter.contains(new Buffer('abcdef', 'hex')).should.equal(true);
    });
  });
  describe('#clone', function() {
    it('will have the same height and address filter', function() {
      var wallet = new Wallet({
        height: 100,
        blockHash: new Buffer('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f', 'hex')
      });
      wallet.addressFilter.insert(new Buffer('abcdef', 'hex'));
      wallet.addressFilter.contains(new Buffer('abcdef', 'hex')).should.equal(true);
      wallet.balance.should.equal(0);
      var wallet2 = wallet.clone();
      wallet2.height.should.equal(100);
      wallet2.addressFilter.contains(new Buffer('abcdef', 'hex')).should.equal(true);
    });
    it('will not create references', function() {
      var blockHash = new Buffer('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f', 'hex');
      var wallet = new Wallet({
        height: 100,
        blockHash: blockHash
      });
      var wallet2 = wallet.clone();
      should.equal(wallet2.blockHash === blockHash, false);
      wallet2.blockHash.should.deep.equal(blockHash);
    });
  });
});
