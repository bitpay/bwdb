'use strict';

var chai = require('chai');
var proxyquire = require('proxyquire');
var should = chai.should();
var sinon = require('sinon');

var Server = require('../lib/server');
var WalletService = require('../lib/wallet-service');
var utils = require('../lib/utils');

describe('Wallet Server', function() {
  describe('@constructor', function() {
    function checkProperties(server) {
      should.exist(server);
      server.network.should.equal('testnet');
      server.configPath.should.equal('/tmp/bwdb');
    }
    it('will construct and set properties', function() {
      var server = new Server({
        network: 'testnet',
        configPath: '/tmp/bwdb'
      });
      checkProperties(server);
    });
    it('will construct and set properties (without new)', function() {
      var server = Server({
        network: 'testnet',
        configPath: '/tmp/bwdb'
      });
      checkProperties(server);
    });
  });
  describe('#_loadConfig', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will load the configuration and setup directories', function(done) {
      sandbox.stub(utils, 'setupDirectory').callsArg(1);
      var setupConfig = sinon.stub().callsArg(0);
      var config = {
        setupConfig: setupConfig,
        path: '/tmp/bwdb'
      };
      var Config = sinon.stub().returns(config);
      var ServerStubbed = proxyquire('../lib/server', {
        './config': Config
      });
      var server = new ServerStubbed({
        network: 'testnet',
        configPath: '/tmp/bwdb'
      });
      server._loadConfig(function(err) {
        if (err) {
          return done(err);
        }
        Config.callCount.should.equal(1);
        Config.args[0][0].should.deep.equal({
          network: 'testnet',
          path: '/tmp/bwdb'
        });
        utils.setupDirectory.callCount.should.equal(1);
        utils.setupDirectory.args[0][0].should.equal('/tmp/bwdb');
        setupConfig.callCount.should.equal(1);
        done();
      });
    });
    it('will handle error from directory setup', function(done) {
      sandbox.stub(utils, 'setupDirectory').callsArgWith(1, new Error('test'));
      var setupConfig = sinon.stub().callsArg(0);
      var config = {
        setupConfig: setupConfig,
        path: '/tmp/bwdb'
      };
      var Config = sinon.stub().returns(config);
      var ServerStubbed = proxyquire('../lib/server', {
        './config': Config
      });
      var server = new ServerStubbed({
        network: 'testnet',
        configPath: '/tmp/bwdb'
      });
      server._loadConfig(function(err) {
        should.exist(err);
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        utils.setupDirectory.callCount.should.equal(1);
        setupConfig.callCount.should.equal(0);
        done();
      });
    });
  });
  describe('#_startNode', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will clone wallet config and construct and start node', function(done) {
      var start = sinon.stub().callsArg(0);
      var Node = sinon.stub().returns({start: start});
      var Bitcoin = sinon.stub();
      var ServerStubbed = proxyquire('../lib/server', {
        'bitcore-node': {
          Node: Node,
          services: {
            Bitcoin: Bitcoin
          }
        }
      });
      var server = new ServerStubbed({
        network: 'testnet',
        configPath: '/tmp/bwdb'
      });
      var wallet = {};
      var bitcoind = {};
      server.config = {
        data: {
          wallet: wallet,
          bitcoind: bitcoind
        }
      };
      server._startNode(function(err) {
        if (err) {
          return done(err);
        }
        should.not.exist(wallet.configPath);
        Node.callCount.should.equal(1);
        Node.args[0][0].should.deep.equal({
          network: 'testnet',
          services: [
            {
              name: 'bitcoind',
              module: Bitcoin,
              config: bitcoind
            },
            {
              name: 'wallet',
              module: WalletService,
              config: {
                configPath: '/tmp/bwdb'
              }
            },
          ]
        });
        done();
      });
    });
  });
  describe('#start', function() {
    it('will load config and start node', function(done) {
      var server = new Server({
        network: 'testnet',
        configPath: '/tmp/bwdb'
      });
      server._loadConfig = sinon.stub().callsArg(0);
      server._startNode = sinon.stub().callsArg(0);
      server.start(done);
    });
    it('will give error from load config', function(done) {
      var server = new Server({
        network: 'testnet',
        configPath: '/tmp/bwdb'
      });
      server._loadConfig = sinon.stub().callsArgWith(0, new Error('test'));
      server._startNode = sinon.stub().callsArg(0);
      server.start(function(err) {
        should.exist(err);
        err.message.should.equal('test');
        server._startNode.callCount.should.equal(0);
        done();
      });
    });
  });
  describe('#stop', function() {
    it('will stop the node', function(done) {
      var server = new Server({
        network: 'testnet',
        configPath: '/tmp/bwdb'
      });
      server.node = {
        stop: sinon.stub().callsArg(0)
      };
      server.stop(done);
    });
  });
});
