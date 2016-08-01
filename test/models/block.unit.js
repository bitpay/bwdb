'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var WalletBlock = require('../../lib/models/block');

describe('WalletBlockModel', function () {
  describe('@constructor', function () {
    it('will create an instance', function () {
      var block = WalletBlock(10, {blockHash: '0b925ce878f804390cf4d845a150ee142a167339d3984796c01a2efb6b5a3ce4'});
      should.exist(block);
      block.blockHash.compare(new Buffer('0b925ce878f804390cf4d845a150ee142a167339d3984796c01a2efb6b5a3ce4', 'hex')).should.equal(0);
    });

    it('will create an instance with buffer', function () {
      var block = new WalletBlock(10, {blockHash: new Buffer('0b925ce878f804390cf4d845a150ee142a167339d3984796c01a2efb6b5a3ce4', 'hex')});
      should.exist(block);
      block.blockHash.toString('hex').should.equal('0b925ce878f804390cf4d845a150ee142a167339d3984796c01a2efb6b5a3ce4');
    });

    it('will create an instance with filter', function () {
      var block = new WalletBlock(10, {
        blockHash: '0b925ce878f804390cf4d845a150ee142a167339d3984796c01a2efb6b5a3ce4',
        addressFilter: {
          vData: new Buffer('01', 'hex'),
          nHashFuncs: 3,
          nTweak: false,
          nFlags: 0,
          noMaxSize: true
        }
      });
      block.addressFilter.vData.toString('hex').should.equal('01');
    });
  });

  describe('@create', function () {
    it('will create an object', function () {
      var block = new WalletBlock(10, {blockHash: '0b925ce878f804390cf4d845a150ee142a167339d3984796c01a2efb6b5a3ce4'});
      var returnedBlock = WalletBlock.create(10, '0b925ce878f804390cf4d845a150ee142a167339d3984796c01a2efb6b5a3ce4');
      block.should.deep.equal(returnedBlock);
    });
  });

  describe('#fromBuffer', function () {
    it('will create a new object from buffer', function () {
      var block = new WalletBlock(10, {blockHash: new Buffer('0b925ce878f804390cf4d845a150ee142a167339d3984796c01a2efb6b5a3ce4', 'hex')});
      var key = block.getKey();
      var hexKey = block.getKey('hex');

      key.toString('hex').should.equal(hexKey);

      var serialized = block.getValue();
      var returnedBlock = WalletBlock.fromBuffer(key, serialized);
      block.height.should.equal(returnedBlock.height);
      block.blockHash.should.deep.equal(returnedBlock.blockHash);
      block.addressFilter.should.deep.equal(returnedBlock.addressFilter);
      should.not.exist(block.deltas);
      should.not.exist(block.spentOutputs);
    });
  });

  describe('#clone', function () {
    it('will clone the object', function () {
      var block = new WalletBlock(10, {blockHash: new Buffer('0b925ce878f804390cf4d845a150ee142a167339d3984796c01a2efb6b5a3ce4', 'hex')});
      var returnedBlock = block.clone();
      block.should.deep.equal(returnedBlock);
    });
  });

});
