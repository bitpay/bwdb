'use strict';

var chai = require('chai');
var bitcore = require('bitcore-lib');
var should = chai.should();
var sinon = require('sinon');

var validators = require('../lib/validators');
var utils = require('../lib/utils');

describe('Wallet Validators', function() {

  var MAX_INT = Math.pow(2, 32) - 1;

  describe('@sanitizeRangeOptions', function() {
    function testDefaultOptions(options) {
      var query = validators.sanitizeRangeOptions(options, 100);
      query.limit.should.equal(10);
      query.height.should.equal(100);
      query.index.should.equal(MAX_INT);
    }
    it('will set default options', function() {
      testDefaultOptions(null);
    });
    it('will set default options if missing "height" and "index"', function() {
      testDefaultOptions({});
    });
    it('will set default options if missing "height"', function() {
      testDefaultOptions({height: 100});
    });
    it('will set default options if missing "index"', function() {
      testDefaultOptions({index: 0});
    });
    it('will set "height" and "index" options', function() {
      var query = validators.sanitizeRangeOptions({height: 3, index: 20});
      query.height.should.equal(3);
      query.index.should.equal(20);
    });
    it('will throw if "limit" exceeds amount', function() {
      (function() {
        validators.sanitizeRangeOptions({height: 3, index: 20, limit: 10000000});
      }).should.throw(Error);
    });
  });
  describe('@checkRangeParams', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will send error from sanitizer', function() {
      var req = {
        query: {},
        bitcoinHeight: 400000
      };
      var res = {};
      sandbox.stub(utils, 'sendError');
      sandbox.stub(validators, 'sanitizeRangeOptions').throws(new Error('test'));
      validators.checkRangeParams(req, res);
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.deep.equal({
        message: 'Invalid params: ' + 'test',
        statusCode: 400
      });
    });
    it('will set the range after passing validation', function() {
      var req = {
        query: {
          height: 400000,
          index: 12,
          limit: 50
        },
        bitcoinHeight: 400000
      };
      var res = {};
      sandbox.stub(utils, 'sendError');
      validators.checkRangeParams(req, res, function() {
        utils.sendError.callCount.should.equal(0);
        req.range.should.deep.equal({
          height: 400000,
          index: 12,
          limit: 50
        });
      });
    });
  });
  describe('@checkAddress', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will get address from body', function(done) {
      var req = {
        network: bitcore.Networks.livenet,
        body: {
          address: '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX'
        },
        params: {}
      };
      var res = {};
      validators.checkAddress(req, res, function() {
        req.address.toString().should.equal('12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX');
        done();
      });
    });
    it('will get address from params', function(done) {
      var req = {
        network: bitcore.Networks.livenet,
        body: {},
        params: {
          address: '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX'
        }
      };
      var res = {};
      validators.checkAddress(req, res, function() {
        req.address.toString().should.equal('12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX');
        done();
      });
    });
    it('will send error with network mismatch', function(done) {
      var req = {
        network: bitcore.Networks.testnet,
        body: {},
        params: {
          address: '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX'
        }
      };
      var res = {};
      sandbox.stub(utils, 'sendError');
      validators.checkAddress(req, res, function() {
        should.not.exist(req.address);
      });
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.deep.equal({
        message: 'Invalid address: ' + 'Address has mismatched network type.',
        statusCode: 400
      });
      done();
    });
    it('will send error if missing address', function(done) {
      var req = {
        network: bitcore.Networks.testnet,
        body: {},
        params: {}
      };
      var res = {};
      sandbox.stub(utils, 'sendError');
      validators.checkAddress(req, res, function() {
        should.not.exist(req.address);
      });
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.deep.equal({
        message: 'Address param is expected',
        statusCode: 400
      });
      done();
    });
  });
  describe('@checkAddresses', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will get address from body', function(done) {
      var req = {
        network: bitcore.Networks.livenet,
        body: {
          addresses: ['12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX']
        }
      };
      var res = {};
      validators.checkAddresses(req, res, function() {
        req.addresses.length.should.equal(1);
        req.addresses[0].toString().should.equal('12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX');
        done();
      });
    });
    it('will send error with network mismatch', function(done) {
      var req = {
        network: bitcore.Networks.testnet,
        body: {
          addresses: ['12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX']
        },
        params: {}
      };
      var res = {};
      sandbox.stub(utils, 'sendError');
      validators.checkAddresses(req, res, function() {
        should.not.exist(req.addresses);
      });
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.deep.equal({
        message: 'Invalid address: ' + 'Address has mismatched network type.',
        statusCode: 400
      });
      done();
    });
    it('will send error if missing address', function(done) {
      var req = {
        network: bitcore.Networks.testnet,
        body: {},
        params: {}
      };
      var res = {};
      sandbox.stub(utils, 'sendError');
      validators.checkAddresses(req, res, function() {
        should.not.exist(req.addresses);
      });
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.deep.equal({
        message: 'Addresses param is expected',
        statusCode: 400
      });
      done();
    });
  });
  describe('@checkWalletId', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will set walletId from params', function(done) {
      var req = {
        params: {
          walletId: '9d340c9b8014d2b96e1b0ae71653fc4460b49513a8fbcc0578f0f3fcb9d964e6'
        }
      };
      var res = {};
      validators.checkWalletId(req, res, function() {
        req.walletId.should.equal('9d340c9b8014d2b96e1b0ae71653fc4460b49513a8fbcc0578f0f3fcb9d964e6');
        done();
      });
    });
    it('will send error for invalid walletId (non hex)', function() {
      var req = {
        params: {
          walletId: 'ad340c9b8014d2b96e1b0ae71@53fc4460b49513a8fbcc0578f0f3fcb9d964e^'
        }
      };
      var res = {};
      sandbox.stub(utils, 'sendError');
      validators.checkWalletId(req, res);
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.deep.equal({
        message: 'Wallet id is expected to be a hexadecimal string with length of 64',
        statusCode: 400
      });
      utils.sendError.args[0][1].should.equal(res);
    });
    it('will send error for invalid walletId (too long)', function() {
      var req = {
        params: {
          walletId: 'ad340c9b8014d2b96e1b0ae7153fc4460b49513a8fbcc0578f0f3fcb9d964ead340c9b8014d2b'
        }
      };
      var res = {};
      sandbox.stub(utils, 'sendError');
      validators.checkWalletId(req, res);
      utils.sendError.callCount.should.equal(1);
      utils.sendError.args[0][0].should.deep.equal({
        message: 'Wallet id is expected to be a hexadecimal string with length of 64',
        statusCode: 400
      });
      utils.sendError.args[0][1].should.equal(res);
    });
  });

});
