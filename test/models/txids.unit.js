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
  describe('#getLatest', function() {
    var walletTxids;
    var walletTxidsTwo;
    before(function() {
      walletTxids = new WalletTxids({data: [
        new Buffer('0000000100000001b28de096a33491363e091bb320173f1958c1bcc58a213f50420e4aa5b11660a5', 'hex'),
        new Buffer('0000000100000002874025c809708fd20e5c5ac6f98c8f515f3786d02031192a45168ffd95ed9b5e', 'hex'),
        new Buffer('000000010000000350b402252930c8fef2be3c2d4d5e8e32be8edb336305b753a3e63c6bf61d6b7e', 'hex'),
        new Buffer('00000001000000047c0f529e81c420ef54037afb0067d956e6abbe877ba1576519abdc1298fd8712', 'hex'),
        new Buffer('0000000300000004c5900a675d19956e986d0199c4dc437529fbfc460995f824901afc376084724a', 'hex'),
        new Buffer('00000006000000019bb0c030918ca3a3af4a9669f83bb3861dbc1125de7a7fa68f1400935b6d1628', 'hex'),
        new Buffer('000000640000000191224c17f6c5af6c007fa6fdf5dd2f5113ad78f16f5784838974fee9aa5f6a33', 'hex'),
        new Buffer('000000640000001e645848e15d738adf2169797fe1f997153f867aad7233e8a984764a96ccee8ee5', 'hex'),
        new Buffer('00000064000007d0608bf212b9a98db5bed28788161b0aa55966f677231713c88ac8fe82ab0123cd', 'hex'),
        new Buffer('0000006400015f9017a67109548be91a5930f47873df037e5e79054ddbe7442987a54d88f135428e', 'hex'),
        new Buffer('00000fa00000000022b623b4a055382be9115122786b7b6fdc01ad67313ac70f96bd8ac32d0c03af', 'hex'),
        new Buffer('00000fa100000000c64d581a7a07448eb97cf42f50a5f00ce284441c77b110ed6b08c4b7731b979a', 'hex'),
        new Buffer('00000fa2000000002c865100af89677c6f07fcc4d4365ced3cc392b512cbdbe07536a920d324ccb0', 'hex'),
        new Buffer('0000138800000000b078e75c4386b9ecabc0cb5452518b95b541565b457a0bff7e714542c0fd8019', 'hex'),
        new Buffer('00061a8000000000a3ecfbc002179bed3057831bc752b8a0409ac61efe3a0aad860f0cfe30d88777', 'hex')
      ]});
      walletTxidsTwo = new WalletTxids({data: [
        new Buffer('0000000100000001b28de096a33491363e091bb320173f1958c1bcc58a213f50420e4aa5b11660a5', 'hex'),
        new Buffer('0000000100000002874025c809708fd20e5c5ac6f98c8f515f3786d02031192a45168ffd95ed9b5e', 'hex')
      ]});
    });
    it('range 0 to 10 (with only two)', function() {
      var txids = walletTxidsTwo.getLatest(0, 10);
      txids.should.deep.equal([
        new Buffer('874025c809708fd20e5c5ac6f98c8f515f3786d02031192a45168ffd95ed9b5e', 'hex'),
        new Buffer('b28de096a33491363e091bb320173f1958c1bcc58a213f50420e4aa5b11660a5', 'hex')
      ]);
    });
    it('range 0 to 3', function() {
      var txids = walletTxids.getLatest(0, 3);
      txids.should.deep.equal([
        new Buffer('a3ecfbc002179bed3057831bc752b8a0409ac61efe3a0aad860f0cfe30d88777', 'hex'),
        new Buffer('b078e75c4386b9ecabc0cb5452518b95b541565b457a0bff7e714542c0fd8019', 'hex'),
        new Buffer('2c865100af89677c6f07fcc4d4365ced3cc392b512cbdbe07536a920d324ccb0', 'hex')
      ]);
    });
    it('range 3 to 4', function() {
      var txids = walletTxids.getLatest(3, 4);
      txids.should.deep.equal([
        new Buffer('c64d581a7a07448eb97cf42f50a5f00ce284441c77b110ed6b08c4b7731b979a', 'hex')
      ]);
    });
    it('range 4 to 14', function() {
      var txids = walletTxids.getLatest(4, 14);
      txids.should.deep.equal([
        new Buffer('22b623b4a055382be9115122786b7b6fdc01ad67313ac70f96bd8ac32d0c03af', 'hex'),
        new Buffer('17a67109548be91a5930f47873df037e5e79054ddbe7442987a54d88f135428e', 'hex'),
        new Buffer('608bf212b9a98db5bed28788161b0aa55966f677231713c88ac8fe82ab0123cd', 'hex'),
        new Buffer('645848e15d738adf2169797fe1f997153f867aad7233e8a984764a96ccee8ee5', 'hex'),
        new Buffer('91224c17f6c5af6c007fa6fdf5dd2f5113ad78f16f5784838974fee9aa5f6a33', 'hex'),
        new Buffer('9bb0c030918ca3a3af4a9669f83bb3861dbc1125de7a7fa68f1400935b6d1628', 'hex'),
        new Buffer('c5900a675d19956e986d0199c4dc437529fbfc460995f824901afc376084724a', 'hex'),
        new Buffer('7c0f529e81c420ef54037afb0067d956e6abbe877ba1576519abdc1298fd8712', 'hex'),
        new Buffer('50b402252930c8fef2be3c2d4d5e8e32be8edb336305b753a3e63c6bf61d6b7e', 'hex'),
        new Buffer('874025c809708fd20e5c5ac6f98c8f515f3786d02031192a45168ffd95ed9b5e', 'hex')
      ]);
    });
    it('range 14 to 15', function() {
      var txids = walletTxids.getLatest(14, 15);
      txids.should.deep.equal([
        new Buffer('b28de096a33491363e091bb320173f1958c1bcc58a213f50420e4aa5b11660a5', 'hex'),
      ]);
    });
    it('range 14 to (value past the end)', function() {
      var txids = walletTxids.getLatest(14, 18);
      txids.should.deep.equal([
        new Buffer('b28de096a33491363e091bb320173f1958c1bcc58a213f50420e4aa5b11660a5', 'hex'),
      ]);
    });
  });
});
