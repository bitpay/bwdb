'use strict';

var chai = require('chai');
var should = chai.should();

var models = require('../../lib/models');
var WalletTransaction = models.WalletTransaction;

describe('Wallet Transaction Model', function() {
  function checkTransaction(tx) {
    tx.walletId.toString('hex').should.equal('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7');
    tx.value.blockHash.should.equal('000000000000000006035200f6e6aa8b59751291d5c704c2f94acd3b04a67cb4');
    tx.value.inputs[0].prevTxId.should.equal('ffa9b1388c3ec2a05d57117bc053d07bda6284c9732672d69cdf21bb8b9c293c');
    tx.value.inputs[0].outputIndex.should.equal(0);
    tx.value.outputs[0].satoshis.should.equal(382504);
    tx.value.feeSatoshis.should.equal(10000);
    tx.value.inputSatoshis.should.equal(50000000);
    tx.value.outputSatoshis.should.equal(49990000);
  }
  var walletId = new Buffer('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7', 'hex');
  var detailedData = {
    blockHash: '000000000000000006035200f6e6aa8b59751291d5c704c2f94acd3b04a67cb4',
    blockIndex: 179,
    height: 348346,
    blockTimestamp: 1426812067,
    version: 1,
    hash: '477a1b4a632187319bfdf78675555ef18af554d2d7caa86b27a3a5230f7c6e98',
    locktime: 0,
    inputSatoshis: 50000000,
    outputSatoshis: 49990000,
    inputs: [
      {
        wallet: false,
        satoshis: 50000000,
        address: '17gaaSEKNyrsnx5zq2yNUC6giZYykXLqr6',
        prevTxId: 'ffa9b1388c3ec2a05d57117bc053d07bda6284c9732672d69cdf21bb8b9c293c',
        outputIndex: 0,
        sequence: 4294967295
      }
    ],
    outputs: [
      {
        script: '76a914d8a01e1a7e81d3003005cf162694fff1c41dfc2f88ac',
        satoshis: 382504,
        address: '1LkQmbqhf34BS8RuV6nq4BjUVtEgrVCcRW',
        wallet: false
      },
      {
        script: '76a9142b0b59f889a580d29d0ac07af6d6cef0970e429988ac',
        satoshis: 49607496,
        address: '14vbexkRxksaicBQUu8CVHwpPeDiJesRXy',
        wallet: true
      }
    ],
    feeSatoshis: 10000
  };
  describe('@constructor', function() {
    it('will construct from detailed transaction', function() {
      var tx = new WalletTransaction(walletId, detailedData);
      should.exist(tx);
      checkTransaction(tx);
    });
    it('will construct from id string', function() {
      var tx = new WalletTransaction(walletId.toString('hex'), detailedData);
      should.exist(tx);
      checkTransaction(tx);
    });		
    it('will construct class', function() {
      var tx = WalletTransaction(walletId, detailedData);
      should.exist(tx);
      checkTransaction(tx);
    });
  });
  describe('@create', function() {
    it('create an object', function() {
      var tx = WalletTransaction.create(walletId, detailedData);
      should.exist(tx);
      checkTransaction(tx);
    });
  });
  describe('#getValue/#fromBuffer', function() {
    it('roundtrip', function() {
      var tx = new WalletTransaction(walletId, detailedData);
      var value = tx.getValue();
      var tx2 = WalletTransaction.fromBuffer(walletId, value);
      checkTransaction(tx2);
    });
  });
  describe('@getDelta', function() {
    it('will return wallet delta for the transaction', function() {
      var tx = {
        inputs: [{wallet: true, satoshis: 150}, {wallet: false, satoshis: 200}],
        outputs: [{wallet: true, satoshis: 100}, {wallet: false, satoshis: 150}]
      };
      WalletTransaction.getDelta(tx).should.equal(-50);
    });
  });
  describe('@getInputSatoshis', function() {
    it('will return sum of inputs for this wallet', function() {
      var tx = {
        inputs: [{wallet: true, satoshis: 150}, {wallet: false, satoshis: 200}, {wallet: true, satoshis: 100}],
        outputs: []
      };
      WalletTransaction.getInputSatoshis(tx).should.equal(250);
    });
    it('will not return an amount if transaction is coinbase', function() {
      var tx = {
        coinbase: true,
        inputs: [],
        outputs: [{wallet: true, satoshis: 1250000000}]
      };
      WalletTransaction.getInputSatoshis(tx).should.equal(0);
    });
  });
  describe('@getOutputSatoshis', function() {
    it('will return sum of outputs for this wallet', function() {
      var tx = {
        inputs: [],
        outputs: [{wallet: true, satoshis: 150}, {wallet: false, satoshis: 200}, {wallet: true, satoshis: 100}]
      };
      WalletTransaction.getOutputSatoshis(tx).should.equal(250);
    });
  });
  describe('@classify', function() {
    it('it will return "send"', function() {
      var tx = {
        inputs: [{wallet: true}, {wallet: true}]
      };
      var delta = -100000;
      WalletTransaction.classify(tx, delta).should.equal('send');
    });
    it('it will return "join"', function() {
      var tx = {
        inputs: [{wallet: true}, {wallet: false}]
      };
      var delta = -100000;
      WalletTransaction.classify(tx, delta).should.equal('join');
    });
    describe('@isJoin', function() {
      it('will return "false"', function() {
	WalletTransaction.isJoin({coinbase: true}, 10).should.equal(false);
      });
    });
    it('it will return "receive"', function() {
      var tx = {
        inputs: [{wallet: false}, {wallet: false}],
        outputs: [{wallet: true}, {wallet: false}]
      };
      var delta = 100000;
      WalletTransaction.classify(tx, delta).should.equal('receive');
    });
    it('it will return "coinbase"', function() {
      var tx = {
        coinbase: true,
        inputs: [],
        outputs: [{wallet: true}]
      };
      var delta = 100000;
      WalletTransaction.classify(tx, delta).should.equal('coinbase');
    });
    it('it will return "move"', function() {
      var tx = {
        inputs: [{wallet: true}],
        outputs: [{wallet: true}]
      };
      var delta = 0;
      WalletTransaction.classify(tx, delta).should.equal('move');
    });
  });
  describe('#getKey', function() {
    it('will get the key', function() {
      var tx = new WalletTransaction(walletId, detailedData);
      var key = tx.getKey('hex');
      var bufferKey = tx.getKey();

      bufferKey.toString('hex').should.equal(key);
      var expectedKey = walletId.toString('hex') + tx.value.hash;
      key.should.equal(expectedKey);
    });
  });
  describe('@getKey', function() {
    it('will get the key', function() {
      var bufferKey = WalletTransaction.getKey(walletId.toString('hex'), new Buffer(detailedData.hash, 'hex'));
      var expectedKey = walletId.toString('hex') + detailedData.hash;
      bufferKey.toString('hex').should.equal(expectedKey);
    });
  });
});
