'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');

var models = require('../../lib/models');
var WalletTxids = models.WalletTxids;

describe('Wallet Txids Model', function() {
  describe('@constructor', function() {
    it('contruct new element', function() {
      var txids = new WalletTxids();
      should.exist(txids);
    });
  });
  describe('#_searchLowerBound', function() {
    var data = [];
    before(function() {
      for(var i = 0; i < 1000001; i++) {
        var buffer = new Buffer(new Array(40));
        buffer.writeUInt32BE(i * 2);
        data.push(buffer);
      }
    });
    describe('will throw error if there is a match', function() {
      it('insert value 2, throw match error', function() {
        var txids = new WalletTxids({data: data});
        var position = new Buffer(new Array(8));
        position.writeUInt32BE(0);
        (function() {
          txids._searchLowerBound(position);
        }).should.throw('Duplicate position exists');
      });
      it('will throw error with matching end position', function() {
        var txids = new WalletTxids({data: data});
        var position = new Buffer(new Array(8));
        position.writeUInt32BE(1000000 * 2);
        (function() {
          txids._searchLowerBound(position);
        }).should.throw('Duplicate position exists');
      });
    });
    describe('will find the lower bound position index', function() {
      it('insert value 1, equal index 0', function() {
        var txids = new WalletTxids({data: data});
        var position = new Buffer(new Array(8));
        position.writeUInt32BE(1);
        var lower = txids._searchLowerBound(position);
        lower.should.equal(0);
        txids._data[lower].readUInt32BE().should.equal(0);
        txids._data[lower + 1].readUInt32BE().should.equal(2);
      });
      it('insert value 3, equal index 1', function() {
        var txids = new WalletTxids({data: data});
        var position = new Buffer(new Array(8));
        position.writeUInt32BE(3);
        var lower = txids._searchLowerBound(position);
        lower.should.equal(1);
        txids._data[lower].readUInt32BE().should.equal(2);
        txids._data[lower + 1].readUInt32BE().should.equal(4);
      });
      it('insert value 1000001, equal index 500000', function() {
        var txids = new WalletTxids({data: data});
        var position = new Buffer(new Array(8));
        position.writeUInt32BE(1000001);
        var lower = txids._searchLowerBound(position);
        lower.should.equal(500000);
        txids._data[lower].readUInt32BE().should.equal(1000000);
        txids._data[lower + 1].readUInt32BE().should.equal(1000002);
      });
      it('will quickly find end position if value is greater', function() {
        var txids = new WalletTxids({data: data});
        var position = new Buffer(new Array(8));
        position.writeUInt32BE(2000001);
        var lower = txids._searchLowerBound(position);
        lower.should.equal(1000000);
        txids._data[lower].readUInt32BE().should.equal(2000000);
      });
      it('will return 0 if data is empty', function () {
        var txids = new WalletTxids({data: []});
        var position = new Buffer(new Array(8));
        position.writeUInt32BE(0);
        var lower = txids._searchLowerBound(position);
        lower.should.equal(0);
      });
    });
  });
  describe('#insert', function() {
    it('will insert into the array', function() {
      var txids = new WalletTxids({data: ['a', 'b', 'c', 'd', 'e', 'f']});
      txids._searchLowerBound = sinon.stub().returns(2);
      txids.insert(412000, 2001, new Buffer('e30ac3db24ef28500f023775d8eb06ad8a26241690080260308208a4020012a4', 'hex'));
      var expectedItem = '00064960000007d1e30ac3db24ef28500f023775d8eb06ad8a26241690080260308208a4020012a4';
      txids._data[3].toString('hex').should.equal(expectedItem);
    });
  });
});
