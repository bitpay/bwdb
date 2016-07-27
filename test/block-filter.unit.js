'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');

var BlockHandler = require('../lib/block-filter');

describe('Wallet Block Filter', function() {
  describe('@constructor', function() {
    it('will construct new object', function() {
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      should.exist(handler);
    });
  });
  describe('#getAddressDeltasFromOutputs', function() {
    it('will iterate over outputs of a transaction and build delta info', function() {
      var address = bitcore.Address('2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d');
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      handler.addressFilter.insert(address.hashBuffer);
      var tx = {
        txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
        index: 29,
        outputs: [{
          address: address.toString(),
          index: 0,
          satoshis: 30000
        }]
      };
      var deltas = handler.getAddressDeltasFromOutputs(tx, 29);
      deltas.should.deep.equal({
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 0,
            blockIndex: 29,
            satoshis: 30000
          }
        ]
      });
    });
    it('will not add output', function() {
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      var address = bitcore.Address('2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d');
      var tx = {
        txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
        index: 29,
        outputs: [{
          address: address.toString(),
          index: 0,
          satoshis: 30000
        }]
      };
      var deltas = handler.getAddressDeltasFromOutputs(tx);
      deltas.should.deep.equal({});
    });
    it('will group multiple outputs by address', function() {
      var address = bitcore.Address('2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d');
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      handler.addressFilter.insert(address.hashBuffer);
      var tx = {
        txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
        index: 29,
        outputs: [
          {
            address: address.toString(),
            index: 0,
            satoshis: 30000
          }, {
            address: address.toString(),
            index: 1,
            satoshis: 20000
          }
        ]
      };
      var deltas = handler.getAddressDeltasFromOutputs(tx);
      deltas.should.deep.equal({
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 0,
            blockIndex: 29,
            satoshis: 30000
          },
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 1,
            blockIndex: 29,
            satoshis: 20000
          }
        ]
      });
    });
  });
  describe('#getAddressDeltasFromInputs', function() {
    it('will iterate over inputs of a transaction and build delta info', function() {
      var address = bitcore.Address('2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d');
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      var tx = {
        txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
        index: 27,
        inputs: [{
          address: address.toString(),
          index: 0,
          satoshis: -30000,
          prevtxid: 'ab6f70a50fa8858f05830abba55133c46bae1b0e93f5dd30addc1163208caf62',
          prevout: 3
        }]
      };
      handler.addressFilter.insert(address.hashBuffer);
      var deltas = handler.getAddressDeltasFromInputs(tx);
      deltas.should.deep.equal({
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 0,
            blockIndex: 27,
            satoshis: -30000,
            prevTxid: 'ab6f70a50fa8858f05830abba55133c46bae1b0e93f5dd30addc1163208caf62',
            prevIndex: 3
          }
        ]
      });
    });
    it('will not add input', function() {
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      var address = bitcore.Address('2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d');
      var tx = {
        txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
        index: 27,
        inputs: [{
          address: address.toString(),
          index: 0,
          satoshis: -30000,
          prevtxid: 'ab6f70a50fa8858f05830abba55133c46bae1b0e93f5dd30addc1163208caf62',
          prevout: 3
        }]
      };
      var deltas = handler.getAddressDeltasFromInputs(tx);
      deltas.should.deep.equal({});
    });
    it('will group by address for multiple inputs', function() {
      var address = bitcore.Address('2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d');
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      var tx = {
        txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
        index: 27,
        inputs: [
          {
            address: address.toString(),
            index: 0,
            satoshis: -30000,
            prevtxid: 'ab6f70a50fa8858f05830abba55133c46bae1b0e93f5dd30addc1163208caf62',
            prevout: 3
          },{
            address: address.toString(),
            index: 1,
            satoshis: -20000,
            prevtxid: '0ca0a547f5f7d5613bf788185cf93fa972efbd57ff3ffb3e5de5d9ee895366e4',
            prevout: 2
          }
        ]
      };
      handler.addressFilter.insert(address.hashBuffer);
      var deltas = handler.getAddressDeltasFromInputs(tx, 27);
      deltas.should.deep.equal({
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 0,
            blockIndex: 27,
            satoshis: -30000,
            prevTxid: 'ab6f70a50fa8858f05830abba55133c46bae1b0e93f5dd30addc1163208caf62',
            prevIndex: 3
          },
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 1,
            blockIndex: 27,
            satoshis: -20000,
            prevTxid: '0ca0a547f5f7d5613bf788185cf93fa972efbd57ff3ffb3e5de5d9ee895366e4',
            prevIndex: 2
          }
        ]
      });
    });
  });
  describe('#buildAddressDeltaList', function() {
    it('will build array grouped by address', function() {
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      var block = {
        deltas: [
          {}
        ]
      };
      handler.getAddressDeltasFromOutputs = sinon.stub().returns({
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 0,
            blockIndex: 29,
            satoshis: 30000
          },
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 1,
            blockIndex: 29,
            satoshis: 20000
          }
        ]
      });
      handler.getAddressDeltasFromInputs = sinon.stub().returns({
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 0,
            blockIndex: 29,
            prevTxid: 'a3868aea5e23b8629c629d969345459b3a28b18f7e8866d3ce03cf52e3cd9925',
            prevIndex: 0,
            satoshis: -30000
          },
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 1,
            blockIndex: 29,
            prevTxid: 'c00f6d128563774f44948bb3833f7e51bff4110c55375d969622ebceca33532f',
            prevIndex: 2,
            satoshis: -20000
          }
        ],
        '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r': [
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: false,
            index: 0,
            blockIndex: 29,
            prevTxid: '4561adb45d562678762dbcbfe468718cb211ee580f108142b054e1c817030adb',
            prevIndex: 3,
            satoshis: -10000
          }
        ]
      });
      var deltas = handler.buildAddressDeltaList(block);
      deltas.should.deep.equal({
        '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r': [
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: false,
            index: 0,
            blockIndex: 29,
            prevTxid: '4561adb45d562678762dbcbfe468718cb211ee580f108142b054e1c817030adb',
            prevIndex: 3,
            satoshis: -10000
          }
        ],
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 0,
            blockIndex: 29,
            satoshis: 30000
          },
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 1,
            blockIndex: 29,
            satoshis: 20000
          },
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 0,
            blockIndex: 29,
            prevTxid: 'a3868aea5e23b8629c629d969345459b3a28b18f7e8866d3ce03cf52e3cd9925',
            prevIndex: 0,
            satoshis: -30000
          },
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 1,
            blockIndex: 29,
            prevTxid: 'c00f6d128563774f44948bb3833f7e51bff4110c55375d969622ebceca33532f',
            prevIndex: 2,
            satoshis: -20000
          }
        ]
      });
    });
  });
});
