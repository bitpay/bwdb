'use strict';

var bitcore = require('bitcore-lib');
var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var proxyquire = require('proxyquire');

var Config = require('../lib/config');

describe('Wallet Config', function() {

  describe('#getWriterSocketPath', function() {
    it('', function() {
    });
  });

  describe('#getNetworkName', function() {
    it('', function() {
    });
  });

  describe('#getDatabasePath', function() {
    afterEach(function() {
      bitcore.Networks.disableRegtest();
    });
    it('will give database path for livenet', function() {
      var config = new Config({network: 'livenet'});
      var dbPath = config.getDatabasePath();
      dbPath.should.equal(process.env.HOME + '/.bwdb/livenet.lmdb');
    });
    it('will give database path for regtest', function() {
      bitcore.Networks.enableRegtest();
      var config = new Config({network: 'regtest'});
      var dbPath = config.getDatabasePath();
      dbPath.should.equal(process.env.HOME + '/.bwdb/regtest.lmdb');
    });
    it('will give database path for testnet', function() {
      var config = new Config({network: 'testnet'});
      var dbPath = config.getDatabasePath();
      dbPath.should.equal(process.env.HOME + '/.bwdb/testnet3.lmdb');
    });
    it('will give error with unknown network', function() {
      var config = new Config({network: 'testnet'});
      config.network = 'unknown';
      (function() {
        config.getDatabasePath();
      }).should.throw(TypeError);
    });
  });

  describe('#getApplicationPath', function() {
    it('will return the application path', function() {
      var config = new Config({network: 'livenet'});
      var path = config.getApplicationPath();
      path.should.equal(process.env.HOME + '/.bwdb');
    });
  });

  describe('#getWriterSocketPath', function() {
    it('will return the writer socket path', function() {
      var config = new Config({network: 'testnet'});
      var wconfigPath = config.getWriterSocketPath(1000);
      wconfigPath.should.equal(process.env.HOME + '/.bwdb/writer-1000.sock');
    });
  });

  describe('#getNetworkName', function() {
    afterEach(function() {
      bitcore.Networks.disableRegtest();
    });
    it('will return network name', function() {
      var config = new Config({network: 'livenet'});
      var networkName = config.getNetworkName();
      networkName.should.equal('livenet');
    });
    it('will return network name for regtest', function() {
      var config = new Config({network: 'regtest'});
      var networkName = config.getNetworkName();
      networkName.should.equal('regtest');
    });
  });

  describe('#getConfigFilePath', function() {
    it('will return config file path', function() {
      var config = new Config({network: 'testnet'});
      var configFilePath = config.getConfigFilePath();
      configFilePath.should.equal(process.env.HOME + '/.bwdb/config.json');
    });
  });

  describe('#writeDefaultConfig', function() {
    it('will write the config to file', function(done) {
      var writeFile = sinon.stub().callsArg(2);
      var Config = proxyquire('../lib/config', {
        'fs': {
          writeFile: writeFile
        }
      });
      var config = new Config({network: 'testnet'});
      config.getConfigFilePath = sinon.stub().returns('configpath');
      config.dirname = '/tmp/dirname';
      config.path = '/tmp/configpath';
      config.writeDefaultConfig(function(err) {
        if (err) {
          return done(err);
        }
        writeFile.callCount.should.equal(1);
        writeFile.args[0][0].should.equal('configpath');
        var expectedData = {
          bitcoind: {
            spawn: {
              datadir: '/tmp/configpath/bitcoin',
              exec: '/tmp/node_modules/.bin/bitcoind'
            }
          },
          wallet: {
            port: 3002
          }
        };
        JSON.parse(writeFile.args[0][1]).should.deep.equal(expectedData);
        done();
      });
    });
    it('will write the config to file', function(done) {
      var writeFile = sinon.stub().callsArgWith(2, new Error('test'));
      var Config = proxyquire('../lib/config', {
        'fs': {
          writeFile: writeFile
        }
      });
      var config = new Config({network: 'testnet'});
      config.writeDefaultConfig(function(err) {
        should.exist(err);
        err.message.should.equal('test');
        done();
      });
    });
  });

  describe('#setupConfig', function() {
    it('should give error if jsoni parse fails', function(done) {
      var readFile = sinon.stub().callsArgWith(2, null, 'something');
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.setupConfig(function(err) {
        should.exist(err);
        err.should.be.instanceOf(SyntaxError);
        readFile.callCount.should.equal(1);
        done();
      });
    });
    it('setup config returns error', function() {
      var readFile = sinon.stub().callsArgWith(2, new Error('error message'), null);
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.setupConfig(function(err) {
        should.exist(err);
        err.message.should.equal('error message');
      });
      readFile.callCount.should.equal(1);
    });
    it('setup config return ENOENT', function(done) {
      var err = new Error();
      err.code = 'ENOENT';
      var readFile = sinon.stub().callsArgWith(2, err, null);
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.writeDefaultConfig = sinon.stub().callsArg(0);
      config.setupConfig(function(err) {
        should.not.exist(err);
        readFile.callCount.should.equal(1);
        config.writeDefaultConfig.callCount.should.equal(1);
        done();
      });
    });
    it('sets up config returns data (with relative)', function(done) {
      var data = {
        bitcoind: {
          spawn: {
            datadir: process.env.HOME,
            exec: '/tmp/bitcoind'
          }
        }
      };
      var readFile = sinon.stub().callsArgWith(2, null, JSON.stringify(data));
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.path = '/tmp';
      config.setupConfig(function(err) {
        if (err) {
          return done(err);
        }
        config.data.should.deep.equal(data);
        readFile.callCount.should.equal(1);
        done();
      });
    });
    it('sets up config (without relative handling)', function(done) {
      var data = {
        bitcoind: 'value'
      };
      var readFile = sinon.stub().callsArgWith(2, null, JSON.stringify(data));
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.setupConfig(function(err) {
        if (err) {
          return done(err);
        }
        readFile.callCount.should.equal(1);
        config.data.should.deep.equal(data);
        done();
      });
    });
  });

  describe('#getURLSync', function() {
    it('will return URL sync https', function() {
      var readFileSync = sinon.stub().returns('{"wallet": {"https":true,"port":18333}}');
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFileSync: readFileSync
        }
      });
      var config = new Config({network: 'livenet'});
      config.getURL(function(err, url) {
        if (err) {
          return done(err);
        }
        url.should.equal('https://localhost:18333');
      });
    });
    it('will return URL sync http', function() {
      var readFileSync = sinon.stub().returns('{"wallet": {"http":true,"port":18333}}');
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFileSync: readFileSync
        }
      });
      var config = new Config({network: 'livenet'});
      config.getURL(function(err, url) {
        if (err) {
          return done(err);
        }
        url.should.equal('http://localhost:18333');
      });
    });
  });
});
