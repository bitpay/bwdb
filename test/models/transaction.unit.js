'use strict';

var chai = require('chai');
var should = chai.should();

var models = require('../../lib/models');
var WalletTransaction = models.WalletTransaction;

describe('Wallet Transaction Model', function() {
  // Response format from getDetailedTransaction
  // see: https://github.com/bitpay/bitcore-node/blob/master/lib/services/bitcoind.js
  var detailedData = {
    blockHash: '000000000000000002cd0ba6e8fae058747d2344929ed857a18d3484156c9250',
    height: 411462,
    blockTimestamp: 1463070382,
    version: 1,
    hash: 'de184cc227f6d1dc0316c7484aa68b58186a18f89d853bb2428b02040c394479',
    locktime: 411451,
    coinbase: true,
    inputs: [
      {
        prevTxId: '3d003413c13eec3fa8ea1fe8bbff6f40718c66facffe2544d7516c9e2900cac2',
        outputIndex: 0,
        sequence: 123456789,
        script: '47304402204ba4aac20e3486885218d8232575a6714bc2e57fdb2d71521703516ecd32be1902207977f3817abcd2e1fcf83d3c91fd611da329592422579ff80dca4045a2e5d1300121026521032dab9ee35e84b4fe46dce6e442a2423a80c1a5c68f8ebdf156b91c171c',
        scriptAsm: '304402204ba4aac20e3486885218d8232575a6714bc2e57fdb2d71521703516ecd32be1902207977f3817abcd2e1fcf83d3c91fd611da329592422579ff80dca4045a2e5d130[ALL] 026521032dab9ee35e84b4fe46dce6e442a2423a80c1a5c68f8ebdf156b91c171c',
        address: '1LCTmj15p7sSXv3jmrPfA6KGs6iuepBiiG',
        satoshis: 771146
      }
    ],
    outputs: [
      {
        satoshis: 811146,
        script: '76a914d2955017f4e3d6510c57b427cf45ae29c372c99088ac',
        scriptAsm: 'OP_DUP OP_HASH160 d2955017f4e3d6510c57b427cf45ae29c372c990 OP_EQUALVERIFY OP_CHECKSIG',
        address: '1LCTmj15p7sSXv3jmrPfA6KGs6iuepBiiG',
        spentTxId: '4316b98e7504073acd19308b4b8c9f4eeb5e811455c54c0ebfe276c0b1eb6315',
        spentIndex: 1,
        spentHeight: 100
      }
    ],
    inputSatoshis: 771146,
    outputSatoshis: 811146,
    feeSatoshis: 40000
  };

  describe('@constructor', function() {
    it('will construct from detailed transaction', function() {
      var tx = new WalletTransaction(detailedData);
      should.exist(tx);
      tx.blockHash.should.equal('000000000000000002cd0ba6e8fae058747d2344929ed857a18d3484156c9250');
      tx.inputs[0].prevTxId.should.equal('3d003413c13eec3fa8ea1fe8bbff6f40718c66facffe2544d7516c9e2900cac2');
      tx.outputs[0].satoshis.should.equal(811146);
      tx.feeSatoshis.should.equal(40000);
    });
  });
  describe('#toBuffer/#fromBuffer', function() {
    it('roundtrip', function() {
      var tx = new WalletTransaction(detailedData);
      var tx2 = WalletTransaction.fromBuffer(tx.toBuffer());
      tx2.blockHash.should.equal('000000000000000002cd0ba6e8fae058747d2344929ed857a18d3484156c9250');
      tx2.inputs[0].prevTxId.should.equal('3d003413c13eec3fa8ea1fe8bbff6f40718c66facffe2544d7516c9e2900cac2');
      tx2.outputs[0].satoshis.should.equal(811146);
      tx2.feeSatoshis.should.equal(40000);
    });
  });
});
