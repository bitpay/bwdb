'use strict';

var chai = require('chai');
var should = chai.should();

var models = require('../../lib/models');
var WalletTxid = models.WalletTxid;

describe('Wallet Txids Model', function() {
  function checkTxid(txid) {
    txid.height.should.equal(404837);
    txid.walletId.toString('hex').should.equal('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7');
    txid.index.should.equal(23);
    txid.value.toString('hex').should.equal('346f7f425b89107716fd1de761a0161d3591e2ae5b3a60282bb66f7ab73a085a');
  }
  var walletId = new Buffer('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7', 'hex');
  describe('@constructor', function() {
    it('with strings', function() {
      var txid = new WalletTxid('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7', {
        height: 404837,
        index: 23,
        value: '346f7f425b89107716fd1de761a0161d3591e2ae5b3a60282bb66f7ab73a085a'
      });
      should.exist(txid);
      checkTxid(txid);
    });
    it('with non instance', function() {
      var txid = WalletTxid('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7', {
        height: 404837,
        index: 23,
        value: '346f7f425b89107716fd1de761a0161d3591e2ae5b3a60282bb66f7ab73a085a'
      });
      should.exist(txid);
      checkTxid(txid);
    });
    it('without options', function() {
      var txid = new WalletTxid('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7');
      txid.should.be.an('object');
      should.exist(txid);
      should.not.exist(txid.height);
      should.exist(txid.walletId);
      should.not.exist(txid.index);
      should.not.exist(txid.value);
    });
    it('with buffers', function() {
      var txid = new WalletTxid(walletId, {
        height: 404837,
        index: 23,
        value: new Buffer('346f7f425b89107716fd1de761a0161d3591e2ae5b3a60282bb66f7ab73a085a', 'hex')
      });
      should.exist(txid);
      checkTxid(txid);
    });
  });
  describe('#create', function() {
    it('will create new instance', function() {
      var txidHex = '346f7f425b89107716fd1de761a0161d3591e2ae5b3a60282bb66f7ab73a085a';
      var txid = WalletTxid.create(walletId, 404837, 23, txidHex);
      should.exist(txid);
      checkTxid(txid);
    });
  });
  describe('#getKey', function() {
    it('will encode key', function() {
      var txid = new WalletTxid(walletId, {
        height: 404837,
        index: 23,
        value: '346f7f425b89107716fd1de761a0161d3591e2ae5b3a60282bb66f7ab73a085a'
      });
      var expectedKey = 'b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7'; // walletId
      expectedKey += '00062d65'; // height
      expectedKey += '00000017'; // index
      txid.getKey().toString('hex').should.equal(expectedKey);
      txid.getKey('hex').should.equal(expectedKey);
    });
  });
  describe('#parseKey', function() {
    it('will parse a key into properties', function() {
      var key = 'b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7'; // walletId
      key += '00062d65'; // height
      key += '00000017'; // index
      var items = WalletTxid.parseKey(key);
      items.walletId.toString('hex').should.equal('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7');
      items.height.should.equal(404837);
      items.index.should.equal(23);
    });
  });
  describe('#getValue', function() {
    it('will return the value', function() {
      var txid = new WalletTxid(walletId, {
        height: 404837,
        index: 23,
        value: '346f7f425b89107716fd1de761a0161d3591e2ae5b3a60282bb66f7ab73a085a'
      });
      txid.getValue().toString('hex').should.equal('346f7f425b89107716fd1de761a0161d3591e2ae5b3a60282bb66f7ab73a085a');
    });
  });
});
