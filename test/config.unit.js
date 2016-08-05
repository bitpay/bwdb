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
      dbPath.should.equal(process.env.HOME + '/.bwsv2/livenet.lmdb');
    });
    it('will give database path for regtest', function() {
      bitcore.Networks.enableRegtest();
      var config = new Config({network: 'regtest'});
      var dbPath = config.getDatabasePath();
      dbPath.should.equal(process.env.HOME + '/.bwsv2/regtest.lmdb');
    });
    it('will give database path for testnet', function() {
      var config = new Config({network: 'testnet'});
      var dbPath = config.getDatabasePath();
      dbPath.should.equal(process.env.HOME + '/.bwsv2/testnet3.lmdb');
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
      path.should.equal(process.env.HOME + '/.bwsv2');
    });
  });

  describe('#getWriterSocketPath', function() {
    it('will return the writer socket path', function() {
      var config = new Config({network: 'testnet'});
      var wconfigPath = config.getWriterSocketPath(1000);
      wconfigPath.should.equal(process.env.HOME + '/.bwsv2/writer-1000.sock');
    });
  });

  describe('#getNetworkName', function() {
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
      configFilePath.should.equal(process.env.HOME + '/.bwsv2/config.json');
    });
  });

  describe('#writeDefaultConfig', function() {
    it('will write the config to file', function() {
      var writeFile = sinon.stub().callsArg(2);
      var Config = proxyquire('../lib/config', {
        'fs': {
          writeFile: writeFile
        }
      });
      var config = new Config({network: 'testnet'});
      var fn = sinon.stub();
      config.writeDefaultConfig(fn);
      writeFile.callCount.should.equal(1);
    });
  });

  describe('#setupConfig', function() {
    var fn = sinon.stub();
    it('sets up config', function() {
      var readFile = sinon.stub().callsArgWith(2, null, 'something');
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.setupConfig(fn);
      readFile.callCount.should.equal(1);
    });
    it('setup config returns error', function() {
      var readFile = sinon.stub().callsArgWith(2, 'error message', null);
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.setupConfig(function(err) {
        should.exist(err);
        err.should.equal('error message');
      });
      readFile.callCount.should.equal(1);
    });
    it('setup config return ENOENT', function() {
      var readFile = sinon.stub().callsArgWith(2, {code: 'ENOENT'}, null);
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.setupConfig(function(err) {
        err.should.exist();
        err.code.should.equal('ENOENT');
        err.errno.should.equal(-2);
      });
      readFile.callCount.should.equal(1);
    });
    it('sets up config returns data', function() {
      var data = '{"bitcoind": {"spawn": {"datadir":"' + new String(process.env.HOME) +'", "exec": "bitcoind"}}}';
      var readFile = sinon.stub().callsArgWith(2, null, data);
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.setupConfig(fn);
      readFile.callCount.should.equal(1);
    });
    it('sets up config', function() {
      var data = '{"bitcoind": "value"}';
      var readFile = sinon.stub().callsArgWith(2, null, data);
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.setupConfig(fn);
      readFile.callCount.should.equal(1);
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
      var url = config.getURLSync();
      url.should.equal('https://localhost:18333');
    });
    it('will return URL sync http', function() {
      var readFileSync = sinon.stub().returns('{"wallet": {"http":true,"port":18333}}');
      var Config = proxyquire('../lib/config', {
        'fs': {
          readFileSync: readFileSync
        }
      });
      var config = new Config({network: 'livenet'});
      var url = config.getURLSync();
      url.should.equal('http://localhost:18333');
    });
  });
});
