'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');

var TxidsStream = require('../../../lib/client/streams/txids');

describe('Wallet Client Txids Stream', function() {
  describe('@constructor', function() {
    var walletId = '66bd1364ee6bf85733ba7541b3d29f5252429d7e31feab149eaaa0c75f09c003';
    var client = {};
    var options = {
      client: client,
      limit: 100,
      height: 100,
      index: 2
    };
    function checkProperties(stream) {
      should.exist(stream);
      stream._walletId.should.equal('66bd1364ee6bf85733ba7541b3d29f5252429d7e31feab149eaaa0c75f09c003');
      stream._client.should.equal(client);
      stream._limit.should.equal(100);
      stream._ended.should.equal(false);
      stream._position.should.deep.equal({height: 100, index: 2});
    }
    it('will create instance', function() {
      var stream = new TxidsStream(walletId, options);
      checkProperties(stream);
    });
    it('will create instance (without new)', function() {
      var stream = TxidsStream(walletId, options);
      checkProperties(stream);
    });
  });
  describe('#_read', function() {
    var walletId = '66bd1364ee6bf85733ba7541b3d29f5252429d7e31feab149eaaa0c75f09c003';
    it('will push null if ended', function(done) {
      var body = {
        txids: []
      };
      var res = {};
      var client = {
        _get: sinon.stub().callsArgWith(2, null, res, body)
      };
      var options = {
        client: client
      };
      var stream = new TxidsStream(walletId, options);
      stream.on('data', function(data) {
        data.should.deep.equal([]);
      });
      stream.on('end', function() {
        done();
      });
    });
    it('will call client get with query options', function(done) {
      var body = {
        txids: [],
        start: {
          height: 400000,
          index: 12
        }
      };
      var res = {};
      var client = {
        _get: sinon.stub().callsArgWith(2, null, res, body)
      };
      var options = {
        client: client,
        limit: 100,
        height: 400000,
        index: 12
      };
      var stream = new TxidsStream(walletId, options);
      stream.on('data', function(data) {
        data.should.deep.equal([]);
      });
      stream.on('end', function() {
        client._get.callCount.should.equal(1);
        client._get.args[0][0].should.equal(
          '/wallets/66bd1364ee6bf85733ba7541b3d29f5252429d7e31feab149eaaa0c75f09c003/txids'
        );
        client._get.args[0][1].should.deep.equal({
          height: 400000,
          index: 12,
          limit: 100
        });
        done();
      });
    });
    it('will emit error from client', function(done) {
      var client = {
        _get: sinon.stub().callsArgWith(2, new Error('test'))
      };
      var options = {
        client: client
      };
      var stream = new TxidsStream(walletId, options);
      stream.on('error', function(err) {
        should.exist(err);
        err.message.should.equal('test');
        done();
      });
      stream.on('data', function(data) {
        should.not.exist(data);
      });
    });
    it('set the next position from body', function(done) {
      var body = {
        txids: [],
        start: {
          height: 400000,
          index: 12
        },
        end: {
          height: 400000,
          index: 18
        }
      };
      var body2 = {
        txids: [],
        start: {
          height: 400000,
          index: 18
        }
      };
      var res = {};
      var get = sinon.stub();
      get.onFirstCall().callsArgWith(2, null, res, body);
      get.onSecondCall().callsArgWith(2, null, res, body2);
      var client = {
        _get: get
      };
      var options = {
        client: client,
        limit: 100,
        height: 400000,
        index: 12
      };
      var stream = new TxidsStream(walletId, options);
      stream.on('data', function(data) {
        data.should.deep.equal([]);
      });
      stream.on('end', function() {
        client._get.callCount.should.equal(2);
        client._get.args[0][0].should.equal(
          '/wallets/66bd1364ee6bf85733ba7541b3d29f5252429d7e31feab149eaaa0c75f09c003/txids'
        );
        client._get.args[0][1].should.deep.equal({
          height: 400000,
          index: 12,
          limit: 100
        });
        client._get.args[1][0].should.equal(
          '/wallets/66bd1364ee6bf85733ba7541b3d29f5252429d7e31feab149eaaa0c75f09c003/txids'
        );
        client._get.args[1][1].should.deep.equal({
          height: 400000,
          index: 18,
          limit: 100
        });
        done();
      });
    });
  });
});
