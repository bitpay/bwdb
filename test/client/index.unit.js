'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var proxyquire = require('proxyquire');

var bitcore = require('bitcore-lib');

var Client = require('../../lib/client');
var db = require('../../lib/client/db');
var utils = require('../../lib/utils');

describe('Wallet Client', function() {
  describe('@constructor', function() {
    function Config(options) {
      options.should.deep.equal({
        network: 'testnet',
        path: '/tmp',
        url: 'somenet'
      });
    }
    function checkProperties(client) {
      should.exist(client);
      client.config.should.instanceOf(Config);
      should.equal(client.bitcoinHeight, null);
      should.equal(client.bitcoinHash, null);
      should.equal(client.socket, null);
      should.equal(client.db, null);
    }
    it('will construct and set properties', function() {
      var ClientStubbed = proxyquire('../../lib/client', {
        './config': Config
      });
      var client = new ClientStubbed({
        network: 'testnet',
        configPath: '/tmp',
        url: 'somenet'
      });
      checkProperties(client);
    });
    it('will construct and set properties (without new)', function() {
      var ClientStubbed = proxyquire('../../lib/client', {
        './config': Config
      });
      var client = ClientStubbed({
        network: 'testnet',
        configPath: '/tmp',
        url: 'somenet'
      });
      checkProperties(client);
    });
  });
  describe('#connect', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('should setup base directory, config and database directories', function(done) {
      sandbox.stub(utils, 'setupDirectory').callsArg(1);
      var client = new Client();
      client.config = {
        setupConfig: sinon.stub().callsArg(0),
        getDatabasePath: sinon.stub().returns('somepath'),
        path: '/tmp'
      };
      sandbox.stub(db, 'open').returns({});
      client.connect(function(err) {
        if (err) {
          return done(err);
        }
        utils.setupDirectory.callCount.should.equal(2);
        utils.setupDirectory.args[0][0].should.equal('/tmp');
        utils.setupDirectory.args[1][0].should.equal('somepath');
        db.open.callCount.should.equal(1);
        db.open.args[0][0].should.equal('somepath');
        done();
      });
    });
    it('should handle error', function(done) {
      sandbox.stub(utils, 'setupDirectory').callsArg(1);
      utils.setupDirectory.onSecondCall().callsArgWith(1, new Error('test'));
      var client = new Client();
      client.config = {
        setupConfig: sinon.stub().callsArg(0),
        getDatabasePath: sinon.stub().returns('somepath'),
        path: '/tmp'
      };
      sandbox.stub(db, 'open').returns({});
      client.connect(function(err) {
        utils.setupDirectory.callCount.should.equal(2);
        err.message.should.equal('test');
        done();
      });
    });
  });
  describe('#disconnect', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('should disconnect if db', function() {
      sandbox.stub(db, 'close');
      var client = new Client();
      client.db = {};
      client.disconnect();
      db.close.callCount.should.equal(1);
    });
    it('should err if no db', function() {
      var client = new Client();
      client.disconnect();
    });
  });
  describe('#_maybeCallback', function() {
    it('will call the callback with error if callback exists', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      client.emit = sinon.stub();
      client._maybeCallback(function(err) {
        err.message.should.equal('test');
        client.emit.callCount.should.equal(0);
        done();
      }, new Error('test'));
    });
    it('will emit error if callback does not exist', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      client.on('error', function(err) {
        err.message.should.equal('test');
        done();
      });
      client._maybeCallback(undefined, new Error('test'));
    });
  });
  describe('#_request', function() {
    it('will set querystring with params if GET request', function(done) {
      var res = {
        headers: {
          'x-bitcoin-network': 'testnet',
          'x-bitcoin-height': 400000,
          'x-bitcoin-hash': '000000000007daca1852c480344ba1c24749780e06c3d4321ca04df545eb7363'
        }
      };
      var body = {};
      var request = sinon.stub().callsArgWith(1, null, res, body);
      var ClientStubbed = proxyquire('../../lib/client', {
        request: request
      });
      var client = new ClientStubbed({
        network: 'testnet',
        configPath: '/tmp'
      });
      var params = {hello: 'world'};
      client.config = {
        url: 'something',
        getNetworkName: sinon.stub().returns('testnet')
      };
      client._request('GET', '/info', params, function(err) {
        if (err) {
          return done(err);
        }
        request.callCount.should.equal(1);
        request.args[0][0].qs.should.equal(params);
        done();
      });
    });
    it('will set json body with params for all requests except GET', function(done) {
      var res = {
        headers: {
          'x-bitcoin-network': 'testnet',
          'x-bitcoin-height': 400000,
          'x-bitcoin-hash': '000000000007daca1852c480344ba1c24749780e06c3d4321ca04df545eb7363'
        }
      };
      var body = {};
      var request = sinon.stub().callsArgWith(1, null, res, body);
      var ClientStubbed = proxyquire('../../lib/client', {
        request: request
      });
      var client = new ClientStubbed({
        network: 'testnet',
        configPath: '/tmp'
      });
      var params = {hello: 'world'};
      client.config = {
        url: 'something',
        getNetworkName: sinon.stub().returns('testnet')
      };
      client._request('POST', '/info', params, function(err) {
        if (err) {
          return done(err);
        }
        request.callCount.should.equal(1);
        request.args[0][0].headers['content-type'].should.equal('application/json');
        request.args[0][0].body.should.equal(params);
        done();
      });
    });
    it('will handle error from request', function(done) {
      var request = sinon.stub().callsArgWith(1, new Error('test'));
      var ClientStubbed = proxyquire('../../lib/client', {
        request: request
      });
      var client = new ClientStubbed({
        network: 'testnet',
        configPath: '/tmp'
      });
      client._request('POST', '/info', {}, function(err) {
        should.exist(err);
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        done();
      });
    });
    it('will give 404 error', function(done) {
      var res = {
        statusCode: 404
      };
      var body = {};
      var request = sinon.stub().callsArgWith(1, null, res, body);
      var ClientStubbed = proxyquire('../../lib/client', {
        request: request
      });
      var client = new ClientStubbed({
        network: 'testnet',
        configPath: '/tmp'
      });
      client._request('GET', '/info', {}, function(err) {
        err.should.be.instanceOf(Error);
        err.statusCode.should.equal(404);
        done();
      });
    });
    it('will give 400 error', function(done) {
      var res = {
        statusCode: 400
      };
      var body = {};
      var request = sinon.stub().callsArgWith(1, null, res, body);
      var ClientStubbed = proxyquire('../../lib/client', {
        request: request
      });
      var client = new ClientStubbed({
        network: 'testnet',
        configPath: '/tmp'
      });
      client._request('GET', '/info', {}, function(err) {
        err.should.be.instanceOf(Error);
        err.statusCode.should.equal(400);
        done();
      });
    });
    it('will give 500 error', function(done) {
      var res = {
        statusCode: 500
      };
      var body = {};
      var request = sinon.stub().callsArgWith(1, null, res, body);
      var ClientStubbed = proxyquire('../../lib/client', {
        request: request
      });
      var client = new ClientStubbed({
        network: 'testnet',
        configPath: '/tmp'
      });
      client._request('GET', '/info', {}, function(err) {
        err.should.be.instanceOf(Error);
        err.statusCode.should.equal(500);
        done();
      });
    });
    it('will give 500 error (greater than 500)', function(done) {
      var res = {
        statusCode: 501
      };
      var body = {};
      var request = sinon.stub().callsArgWith(1, null, res, body);
      var ClientStubbed = proxyquire('../../lib/client', {
        request: request
      });
      var client = new ClientStubbed({
        network: 'testnet',
        configPath: '/tmp'
      });
      client._request('GET', '/info', {}, function(err) {
        err.should.be.instanceOf(Error);
        err.statusCode.should.equal(501);
        done();
      });
    });
    it('will give error with network mismatch', function(done) {
      var res = {
        statusCode: 200,
        headers: {
          'x-bitcoin-network': 'livenet',
          'x-bitcoin-height': 400000,
          'x-bitcoin-hash': '000000000007daca1852c480344ba1c24749780e06c3d4321ca04df545eb7363'
        }
      };
      var body = {};
      var request = sinon.stub().callsArgWith(1, null, res, body);
      var ClientStubbed = proxyquire('../../lib/client', {
        request: request
      });
      var client = new ClientStubbed({
        network: 'testnet',
        configPath: '/tmp'
      });
      client.config = {
        url: 'something',
        getNetworkName: sinon.stub().returns('testnet')
      };
      client._request('GET', '/info', {}, function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.match(/^Network mismatch/);
        done();
      });
    });
    it('will set bitcoin chain info', function(done) {
      var res = {
        headers: {
          'x-bitcoin-network': 'testnet',
          'x-bitcoin-height': 400000,
          'x-bitcoin-hash': '000000000007daca1852c480344ba1c24749780e06c3d4321ca04df545eb7363'
        }
      };
      var body = {};
      var request = sinon.stub().callsArgWith(1, null, res, body);
      var ClientStubbed = proxyquire('../../lib/client', {
        request: request
      });
      var client = new ClientStubbed({
        network: 'testnet',
        configPath: '/tmp'
      });
      var params = {hello: 'world'};
      client.config = {
        url: 'something',
        getNetworkName: sinon.stub().returns('testnet')
      };
      client._request('GET', '/info', params, function(err, res1, body1) {
        if (err) {
          return done(err);
        }
        res1.should.equal(res);
        body1.should.equal(body);
        client.bitcoinHeight.should.equal(400000);
        client.bitcoinHash.should.equal('000000000007daca1852c480344ba1c24749780e06c3d4321ca04df545eb7363');
        done();
      });
    });
  });
  describe('#_put', function() {
    it('will call request with correct arguments', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      client._request = sinon.stub().callsArg(3);
      client._put('/info', function(err) {
        if (err) {
          return done(err);
        }
        client._request.callCount.should.equal(1);
        client._request.args[0][0].should.equal('PUT');
        client._request.args[0][1].should.equal('/info');
        client._request.args[0][2].should.equal(false);
        done();
      });
    });
  });
  describe('#_get', function() {
    it('will call request with correct arguments', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      client._request = sinon.stub().callsArg(3);
      var params = {};
      client._get('/info', params, function(err) {
        if (err) {
          return done(err);
        }
        client._request.callCount.should.equal(1);
        client._request.args[0][0].should.equal('GET');
        client._request.args[0][1].should.equal('/info');
        client._request.args[0][2].should.equal(params);
        done();
      });
    });
  });
  describe('#_post', function() {
    it('will call request with correct arguments', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      client._request = sinon.stub().callsArg(3);
      var params = {};
      client._post('/info', params, function(err) {
        if (err) {
          return done(err);
        }
        client._request.callCount.should.equal(1);
        client._request.args[0][0].should.equal('POST');
        client._request.args[0][1].should.equal('/info');
        client._request.args[0][2].should.equal(params);
        done();
      });
    });
  });
  describe('#createWallet', function() {
    it('will call put to wallets endpoint', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      var walletId = '2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b';
      var expectedRes = {};
      var expectedBody = {};
      client._put = sinon.stub().callsArgWith(1, null, expectedRes, expectedBody);
      client.createWallet(walletId, function(err, res, body) {
        if (err) {
          return done(err);
        }
        client._put.callCount.should.equal(1);
        var expectedUrl = '/wallets/2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b';
        client._put.args[0][0].should.equal(expectedUrl);
        res.should.equal(expectedRes);
        body.should.equal(expectedBody);
        done();
      });
    });
  });
  describe('#importAddress', function() {
    it('will call put to wallet addresses endpoint', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      var walletId = '2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b';
      var expectedRes = {};
      var expectedBody = {};
      client._put = sinon.stub().callsArgWith(1, null, expectedRes, expectedBody);
      var address = '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX';
      client.importAddress(walletId, address, function(err, res, body) {
        if (err) {
          return done(err);
        }
        client._put.callCount.should.equal(1);
        var expectedUrl = '/wallets/2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b' +
          '/addresses/12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX';
        client._put.args[0][0].should.equal(expectedUrl);
        res.should.equal(expectedRes);
        body.should.equal(expectedBody);
        done();
      });
    });
  });
  describe('#importAddresses', function() {
    it('will call post to wallet addresses endpoint', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      var walletId = '2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b';
      var expectedRes = {};
      var expectedBody = {};
      client._post = sinon.stub().callsArgWith(2, null, expectedRes, expectedBody);
      var addresses = ['12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX'];
      client.importAddresses(walletId, addresses, function(err, res, body) {
        if (err) {
          return done(err);
        }
        client._post.callCount.should.equal(1);
        var expectedUrl = '/wallets/2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b' +
          '/addresses';
        client._post.args[0][0].should.equal(expectedUrl);
        res.should.equal(expectedRes);
        body.should.equal(expectedBody);
        done();
      });
    });
  });
  describe('#getTransactions', function() {
    it('will call get to wallet transactions endpoint', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      var walletId = '2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b';
      var expectedRes = {};
      var expectedBody = {};
      client._get = sinon.stub().callsArgWith(2, null, expectedRes, expectedBody);
      var options = {};
      client.getTransactions(walletId, options, function(err, res, body) {
        if (err) {
          return done(err);
        }
        client._get.callCount.should.equal(1);
        var expectedUrl = '/wallets/2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b' +
          '/transactions';
        client._get.args[0][0].should.equal(expectedUrl);
        client._get.args[0][1].should.equal(options);
        res.should.equal(expectedRes);
        body.should.equal(expectedBody);
        done();
      });
    });
  });
  describe('#getUTXOs', function() {
    it('will call get to wallet utxos endpoint', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      var walletId = '2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b';
      var expectedRes = {};
      var expectedBody = {};
      client._get = sinon.stub().callsArgWith(2, null, expectedRes, expectedBody);
      var options = {};
      client.getUTXOs(walletId, options, function(err, res, body) {
        if (err) {
          return done(err);
        }
        client._get.callCount.should.equal(1);
        var expectedUrl = '/wallets/2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b' +
          '/utxos';
        client._get.args[0][0].should.equal(expectedUrl);
        client._get.args[0][1].should.equal(options);
        res.should.equal(expectedRes);
        body.should.equal(expectedBody);
        done();
      });
    });
  });
  describe('#getTxids', function() {
    it('will call get to wallet txids endpoint', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      var walletId = '2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b';
      var expectedRes = {};
      var expectedBody = {};
      client._get = sinon.stub().callsArgWith(2, null, expectedRes, expectedBody);
      var options = {};
      client.getTxids(walletId, options, function(err, res, body) {
        if (err) {
          return done(err);
        }
        client._get.callCount.should.equal(1);
        var expectedUrl = '/wallets/2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b' +
          '/txids';
        client._get.args[0][0].should.equal(expectedUrl);
        client._get.args[0][1].should.equal(options);
        res.should.equal(expectedRes);
        body.should.equal(expectedBody);
        done();
      });
    });
  });
  describe('#getBalance', function() {
    it('will call get to the wallet balance endpoint', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      var walletId = '2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b';
      var expectedRes = {};
      var expectedBody = {};
      client._get = sinon.stub().callsArgWith(2, null, expectedRes, expectedBody);
      client.getBalance(walletId, function(err, res, body) {
        if (err) {
          return done(err);
        }
        client._get.callCount.should.equal(1);
        var expectedUrl = '/wallets/2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b' +
          '/balance';
        client._get.args[0][0].should.equal(expectedUrl);
        res.should.equal(expectedRes);
        body.should.equal(expectedBody);
        done();
      });
    });
  });
  describe('#getInfo', function() {
    it('will call get to the info endpoint', function(done) {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      var expectedRes = {};
      var expectedBody = {};
      client._get = sinon.stub().callsArgWith(2, null, expectedRes, expectedBody);
      client.getInfo(function(err, res, body) {
        if (err) {
          return done(err);
        }
        client._get.callCount.should.equal(1);
        var expectedUrl = '/info';
        client._get.args[0][0].should.equal(expectedUrl);
        res.should.equal(expectedRes);
        body.should.equal(expectedBody);
        done();
      });
    });
  });
  describe('#getTransactionsStream', function() {
    it('will return a TransactionsStream instance', function() {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      var walletId = '2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b';
      var options = {};
      var stream = client.getTransactionsStream(walletId, options);
      stream.should.be.instanceOf(Client.TransactionsStream);
    });
  });
  describe('#getTxidsStream', function() {
    it('will return a TxidsStream instance', function() {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      var walletId = '2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b';
      var options = {};
      var stream = client.getTxidsStream(walletId, options);
      stream.should.be.instanceOf(Client.TxidsStream);
    });
  });
  describe('#getTransactionsCSVStream', function() {
    it('will return a CSVStream instance', function() {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      var walletId = '2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b';
      var options = {};
      var stream = client.getTransactionsCSVStream(walletId, options);
      stream.should.be.instanceOf(Client.CSVStream);
    });
  });
  describe('#getTransactionsListStream', function() {
    it('will return a ListStream instance', function() {
      var client = new Client({
        network: 'testnet',
        configPath: '/tmp'
      });
      var walletId = '2b5848038f5fac0b67badd525d43b62d848a0ee9afd27f9672e4dc3962370b6b';
      var options = {};
      var stream = client.getTransactionsListStream(walletId, options);
      stream.should.be.instanceOf(Client.ListStream);
    });
  });
});
