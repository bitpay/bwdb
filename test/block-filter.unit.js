'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var bitcore = require('bitcore-lib');
var BloomFilter = require('bloom-filter');

var BlockHandler = require('../lib/block-filter');

describe.skip('Wallet Block Filter', function() {
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
      var filter = BloomFilter.create(100, 0.1);
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: filter
      });
      var output = {
        script: null
      };
      var address2 = handler.getAddressFromOutput(output);
      address2.should.equal(false);
    });
    it('will not find address', function() {
      var filter = BloomFilter.create(100, 0.1);
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: filter
      });
      var output = {
        script: {
          toAddress: sinon.stub().returns(false)
        }
      };
      var address2 = handler.getAddressFromOutput(output);
      address2.should.equal(false);
    });
    it('will find address but filter it out', function() {
      var address = bitcore.Address('16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r');
      var filter = BloomFilter.create(100, 0.1);
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: filter
      });
      var output = {
        script: {
          toAddress: sinon.stub().returns(address)
        }
      };
      var address2 = handler.getAddressFromOutput(output);
      address2.should.equal(false);
    });
    it('will find address and keep it', function() {
      var address = bitcore.Address('16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r');
      var filter = BloomFilter.create(100, 0.1);
      filter.insert(address.hashBuffer);
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: filter
      });
      var output = {
        script: {
          toAddress: sinon.stub().returns(address)
        }
      };
      var address2 = handler.getAddressFromOutput(output);
      address2.toString().should.equal(address.toString());
    });
  });
  describe('#getAddressFromInput', function() {
    var p2shInScript = bitcore.Script('OP_0 73 0x30460221008ca148504190c10eea7f5f9c283c719a37be58c3ad617928011a1bb9570901d2022100ced371a23e86af6f55ff4ce705c57d2721a09c4d192ca39d82c4239825f75a9801 72 0x30450220357011fd3b3ad2b8f2f2d01e05dc6108b51d2a245b4ef40c112d6004596f0475022100a8208c93a39e0c366b983f9a80bfaf89237fcd64ca543568badd2d18ee2e1d7501 OP_PUSHDATA1 105 0x5221024c02dff2f0b8263a562a69ec875b2c95ffad860f428acf2f9e8c6492bd067d362103546324a1351a6b601c623b463e33b6103ca444707d5b278ece1692f1aa7724a42103b1ad3b328429450069cc3f9fa80d537ee66ba1120e93f3f185a5bf686fb51e0a53ae');
    it('will handle a null script', function() {
      var filter = BloomFilter.create(100, 0.1);
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: filter
      });
      var input = {
        script: null
      };
      var address2 = handler.getAddressFromInput(input);
      address2.should.equal(false);
    });
    it('will not find address', function() {
      var filter = BloomFilter.create(100, 0.1);
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: filter
      });
      var input = {
        script: {
          isPublicKeyHashIn: sinon.stub().returns(false),
          isScriptHashIn: sinon.stub().returns(false)
        }
      };
      var address2 = handler.getAddressFromInput(input);
      address2.should.equal(false);
    });
    it('will find address but filter it out', function() {
      var filter = BloomFilter.create(100, 0.1);
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: filter
      });
      var input = {
        script: p2shInScript
      };
      var address2 = handler.getAddressFromInput(input);
      address2.should.equal(false);
    });
    it('will find address and keep it', function() {
      var address = bitcore.Address('2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d');
      var filter = BloomFilter.create(100, 0.1);
      filter.insert(address.hashBuffer);
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: filter
      });
      var input = {
        script: p2shInScript
      };
      var address2 = handler.getAddressFromInput(input);
      address2.toString().should.equal(address.toString());
    });
  });
  describe('#getAddressDeltasFromOutputs', function() {
    it('will iterate over outputs of a transaction and build delta info', function() {
      var address = bitcore.Address('2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d');
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      handler.getAddressFromOutput = sinon.stub().returns(address);
      var tx = {
        hash: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
        outputs: [{}]
      };
      var deltas = handler.getAddressDeltasFromOutputs(tx, 29);
      deltas.should.deep.equal({
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 0,
            blockIndex: 29
          }
        ]
      });
    });
    it('will not add output', function() {
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      handler.getAddressFromOutput = sinon.stub().returns(false);
      var tx = {
        hash: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
        outputs: [{}]
      };
      var deltas = handler.getAddressDeltasFromOutputs(tx, 29);
      deltas.should.deep.equal({});
    });
    it('will group multiple outputs by address', function() {
      var address = bitcore.Address('2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d');
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      handler.getAddressFromOutput = sinon.stub().returns(address);
      var tx = {
        hash: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
        outputs: [{}, {}]
      };
      var deltas = handler.getAddressDeltasFromOutputs(tx, 29);
      deltas.should.deep.equal({
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 0,
            blockIndex: 29
          },
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 1,
            blockIndex: 29
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
      handler.getAddressFromInput = sinon.stub().returns(address);
      var tx = {
        hash: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
        inputs: [{}]
      };
      var deltas = handler.getAddressDeltasFromInputs(tx, 27);
      deltas.should.deep.equal({
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 0,
            blockIndex: 27
          }
        ]
      });
    });
    it('will not add input', function() {
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      handler.getAddressFromInput = sinon.stub().returns(false);
      var tx = {
        hash: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
        inputs: [{}]
      };
      var deltas = handler.getAddressDeltasFromInputs(tx, 27);
      deltas.should.deep.equal({});
    });
    it('will group by address for multiple inputs', function() {
      var address = bitcore.Address('2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d');
      var handler = new BlockHandler({
        network: bitcore.Networks.testnet,
        addressFilter: BloomFilter.create(100, 0.1)
      });
      handler.getAddressFromInput = sinon.stub().returns(address);
      var tx = {
        hash: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
        inputs: [{}, {}]
      };
      var deltas = handler.getAddressDeltasFromInputs(tx, 27);
      deltas.should.deep.equal({
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 0,
            blockIndex: 27
          },
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 1,
            blockIndex: 27
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
        transactions: [
          {}
        ]
      };
      handler.getAddressDeltasFromOutputs = sinon.stub().returns({
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 0,
            blockIndex: 29
          },
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 1,
            blockIndex: 29
          }
        ]
      });
      handler.getAddressDeltasFromInputs = sinon.stub().returns({
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 0,
            blockIndex: 29
          },
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 1,
            blockIndex: 29
          }
        ],
        '16VZnHwRhwrExfeHFHGjwrgEMq8VcYPs9r': [
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: false,
            index: 0,
            blockIndex: 29
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
            blockIndex: 29
          }
        ],
        '2MvjMzX36nATqcb1TdAF4Qh6pBS4cxcJM8d': [
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 0,
            blockIndex: 29
          },
          {
            txid: '2891a13dfff64169e90dfb3c46b8551ff2f842adc4aa502c7c716d97aed0486f',
            receiving: true,
            index: 1,
            blockIndex: 29
          },
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 0,
            blockIndex: 29
          },
          {
            txid: '0efbf7716b2b683bb2134d19fd13108a239dd6154d0aee260e0f5ce5c85be27c',
            receiving: false,
            index: 1,
            blockIndex: 29
          }
        ]
      });
    });
  });
});
