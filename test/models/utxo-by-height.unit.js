'use strict';

var chai = require('chai');
var should = chai.should();
var bitcore = require('bitcore-lib');

var models = require('../../lib/models');
var WalletUTXOByHeight = models.WalletUTXOByHeight;

describe('Wallet UTXO By Height Model', function() {
  function checkUTXO(utxo) {
    should.exist(utxo);
    utxo.address.toString().should.equal('mrU9pEmAx26HcbKVrABvgL7AwA5fjNFoDc');
    utxo.index.should.equal(3);
    utxo.height.should.equal(100001);
    utxo.satoshis.should.equal(300000);
    utxo.txid.toString('hex').should.equal('5dde1b67c1a1dbc459f56a71efcedbd06c9516c51a9f901067253341175615bc');
    utxo.walletId.toString('hex').should.equal('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7');
  }
  function checkUTXOObject(utxo) {
    should.exist(utxo);
    utxo.address.should.equal('mrU9pEmAx26HcbKVrABvgL7AwA5fjNFoDc');
    utxo.index.should.equal(3);
    utxo.height.should.equal(100001);
    utxo.satoshis.should.equal(300000);
    utxo.txid.should.equal('5dde1b67c1a1dbc459f56a71efcedbd06c9516c51a9f901067253341175615bc');
    utxo.walletId.should.equal('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7');
  }
  var walletId = new Buffer('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7', 'hex');
  describe('@constructor', function() {
    it('with hex strings', function() {
      var utxo = new WalletUTXOByHeight('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7', {
        address: 'mrU9pEmAx26HcbKVrABvgL7AwA5fjNFoDc',
        satoshis: 300000,
        txid: '5dde1b67c1a1dbc459f56a71efcedbd06c9516c51a9f901067253341175615bc',
        index: 3,
        height: 100001
      });
      should.exist(utxo);
    });
    it('with buffers', function() {
      var utxo = new WalletUTXOByHeight(walletId, {
        address: 'mrU9pEmAx26HcbKVrABvgL7AwA5fjNFoDc',
        satoshis: 300000,
        txid: new Buffer('5dde1b67c1a1dbc459f56a71efcedbd06c9516c51a9f901067253341175615bc', 'hex'),
        index: 3,
        height: 100001
      });
      checkUTXO(utxo);
    });
    it('with bitcore address', function() {
      var utxo = new WalletUTXOByHeight(walletId, {
        address: bitcore.Address('mrU9pEmAx26HcbKVrABvgL7AwA5fjNFoDc'),
        satoshis: 300000,
        txid: new Buffer('5dde1b67c1a1dbc459f56a71efcedbd06c9516c51a9f901067253341175615bc', 'hex'),
        index: 3,
        height: 100001
      });
      checkUTXO(utxo);
    });
  });
  describe('#getKey', function() {
    it('will get the correct key', function() {
      var utxo = new WalletUTXOByHeight(walletId, {
        address: bitcore.Address('mrU9pEmAx26HcbKVrABvgL7AwA5fjNFoDc'),
        satoshis: 300000,
        txid: new Buffer('5dde1b67c1a1dbc459f56a71efcedbd06c9516c51a9f901067253341175615bc', 'hex'),
        index: 3,
        height: 100001
      });
      var expectedKey = 'b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7'; // walletId
      expectedKey += '000186a1'; // height
      expectedKey += '5dde1b67c1a1dbc459f56a71efcedbd06c9516c51a9f901067253341175615bc'; // txid
      expectedKey += '00000003'; // index
      utxo.getKey('hex').should.equal(expectedKey);
    });
  });
  describe('@getKey', function() {
    it('will get the correct key', function() {
      var txid = '5dde1b67c1a1dbc459f56a71efcedbd06c9516c51a9f901067253341175615bc';
      var key = WalletUTXOByHeight.getKey(walletId, 100001, txid, 3, 'hex');
      var expectedKey = 'b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7';
      expectedKey += '000186a1';
      expectedKey += '5dde1b67c1a1dbc459f56a71efcedbd06c9516c51a9f901067253341175615bc';
      expectedKey += '00000003';
      key.should.equal(expectedKey);
    });
  });
  describe('#getValue', function() {
    it('will get the correct value', function() {
      var utxo = new WalletUTXOByHeight(walletId, {
        address: bitcore.Address('mrU9pEmAx26HcbKVrABvgL7AwA5fjNFoDc'),
        satoshis: 300000,
        txid: new Buffer('5dde1b67c1a1dbc459f56a71efcedbd06c9516c51a9f901067253341175615bc', 'hex'),
        index: 3,
        height: 100001
      });
      var expectedValue = '41124f8000000000'; // satoshis
      expectedValue += '01'; // address type
      expectedValue += '7821c0a3768aa9d1a37e16cf76002aef5373f1a8'; // address ripemd160 hash
      utxo.getValue().toString('hex').should.equal(expectedValue);
    });
  });
  describe('@fromBuffer', function() {
    it('will parse correctly', function() {
      var value = '41124f8000000000'; // satoshis
      value += '01'; // address type
      value += '7821c0a3768aa9d1a37e16cf76002aef5373f1a8'; // address ripemd160 hash
      var valueBuf = new Buffer(value, 'hex');

      var key = 'b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7'; // walletId
      key += '000186a1'; // height
      key += '5dde1b67c1a1dbc459f56a71efcedbd06c9516c51a9f901067253341175615bc'; // txid
      key += '00000003'; // index

      var utxo = WalletUTXOByHeight.fromBuffer(key, valueBuf, bitcore.Networks.testnet);
      checkUTXO(utxo);
    });
  });
  describe('#toJSON', function() {
    it('will export JSON', function() {
      var utxo = new WalletUTXOByHeight(walletId, {
        address: 'mrU9pEmAx26HcbKVrABvgL7AwA5fjNFoDc',
        satoshis: 300000,
        txid: new Buffer('5dde1b67c1a1dbc459f56a71efcedbd06c9516c51a9f901067253341175615bc', 'hex'),
        index: 3,
        height: 100001
      });
      checkUTXOObject(JSON.parse(JSON.stringify(utxo)));
    });
  });
});
