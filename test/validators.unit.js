'use strict';

describe.skip('Wallet Validators', function() {

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

});
