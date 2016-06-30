'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');

describe.skip('Wallet Web Worker', function() {
  describe('@constructor', function() {
    it('', function() {
    });
  });
  describe('#_initOptions', function() {
    it('', function() {
    });
  });
  describe('#start', function() {
    it('', function() {
    });
  });
  describe('#stop', function() {
    it('', function() {
    });
  });
  describe('#_initClients', function() {
    it('', function() {
    });
  });
  describe('#_connectWriterSocket', function() {
    it('', function() {
    });
  });
  describe('#_queueWriterTask', function() {
    it('', function() {
    });
  });
  describe('#_sanitizeRangeOptions', function() {
    it('', function() {
    });
  });
  describe('#_checkRangeParams', function() {
    function testDefaultOptions(options, callback) {
      var wallet = new Wallet({node: node});
      wallet.bitcoind = {
        height: 100
      };
      wallet.walletTxids = {};
      wallet.walletTxids.getLatest = sinon.stub().returns([]);
      var query = wallet._checkTxidsQuery(options);
      query.limit.should.equal(10);
      query.height.should.equal(100);
      query.index.should.equal(0);
      callback();
    }
    it('will set default options', function(done) {
      testDefaultOptions(null, done);
    });
    it('will set default options if missing "height" and "index"', function(done) {
      testDefaultOptions({}, done);
    });
    it('will set default options if missing "height"', function(done) {
      testDefaultOptions({height: 100}, done);
    });
    it('will set default options if missing "index"', function(done) {
      testDefaultOptions({index: 0}, done);
    });
    it('will set "height" and "index" options', function(done) {
      var wallet = new Wallet({node: node});
      wallet.walletTxids = {};
      wallet.walletTxids.getLatest = sinon.stub().returns([]);
      var query = wallet._checkTxidsQuery({height: 3, index: 20});
      query.height.should.equal(3);
      query.index.should.equal(20);
      done();
    });
  });
  describe('#_checkAddress', function() {
    it('', function() {
    });
  });
  describe('#_checkAddresses', function() {
    it('', function() {
    });
  });
  describe('#_importTransaction', function() {
    it('will get detailed transaction from bitcoind and save to database', function() {
    });
    it('will handle error from bitcoind', function() {
    });
  });
  describe('#getWalletTransactions', function() {
    it('will set default start and end options', function() {
    });
    it('will validate start and end options', function() {
    });
    it('will map over txids and get wallet transactions', function() {
    });
    it('will map over txids and import transactions that are missing', function() {
    });
  });
  describe('#_getLatestTxids', function() {
    it('', function() {
    });
  });
  describe.skip('#getWalletTxids', function() {
    it('will give error if options are invalid', function(done) {
      var wallet = new Wallet({node: node});
      var txn = {
        abort: sinon.stub()
      };
      wallet.db = {
        env: {
          beginTxn: sinon.stub().returns(txn)
        }
      };
      wallet._checkTxidsQuery = sinon.stub().throws(new Error('test'));
      wallet.getWalletTxids({}, function(err) {
        err.should.be.instanceOf(Error);
        txn.abort.callCount.should.equal(1);
        done();
      });
    });
    it('will give buffers if option is set', function() {
    });
    it('will give hex strings if option buffer is not set', function() {
    });
  });
  describe('#_startListener', function() {
    it('', function() {
    });
  });
});
