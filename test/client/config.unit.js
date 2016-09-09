'use strict';

var bitcore = require('bitcore-lib');
var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var proxyquire = require('proxyquire');

var Config = require('../../lib/client/config');

describe('Wallet Client Config', function() {

  describe('#getNetworkName', function() {
    afterEach(function() {
      bitcore.Networks.disableRegtest();
    });
    it('will return network name', function() {
      var config = new Config({network: 'livenet'});
      config.defineProperties();
      var networkName = config.getNetworkName();
      networkName.should.equal('livenet');
    });
    it('will return network name for regtest', function() {
      var config = new Config({network: 'regtest'});
      config.defineProperties();
      var networkName = config.getNetworkName();
      networkName.should.equal('regtest');
    });
  });

  describe('#getConfigFilePath', function() {
    it('will return config file path', function() {
      var config = new Config({network: 'testnet'});
      var configFilePath = config.getConfigFilePath();
      configFilePath.should.equal(process.env.HOME + '/.bwdb/client.json');
    });
  });

  describe('#writeDefaultConfig', function() {
    it('will write the config to file', function(done) {
      var writeFile = sinon.stub().callsArg(2);
      var Config = proxyquire('../../lib/client/config', {
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
          url: 'http://localhost:3002',
          network: 'livenet'
        };
        JSON.parse(writeFile.args[0][1]).should.deep.equal(expectedData);
        done();
      });
    });
    it('will give error', function(done) {
      var writeFile = sinon.stub().callsArgWith(2, new Error('test'));
      var Config = proxyquire('../../lib/client/config', {
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
  describe('#writeApiKey', function() {
    it('write to file', function(done) {
      var writeFile = sinon.stub().callsArg(2);
      var fs = {writeFile: writeFile};
      var Config = proxyquire('../../lib/client/config', {'fs': fs});
      var config = new Config();
      config.getConfigFilePath = sinon.stub().returns('some path');
      config.data = {};
      config.writeApiKey('cipher', 'public', 'salt', function(err) {
        if (err) {
          return done(err);
        }
        JSON.parse(fs.writeFile.args[0][1]).should.deep.equal({
          apiKey: {
            cipherText: 'cipher',
            publicKey: 'public',
            salt: 'salt'
          }
        });
        fs.writeFile.args[0][0].should.equal('some path');
        done();
      });
    });
  });
  describe('#setupConfigData', function() {
    it('should give error if jsoni parse fails', function(done) {
      var readFile = sinon.stub().callsArgWith(2, null, 'something');
      var Config = proxyquire('../../lib/client/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.setupConfigData(function(err) {
        should.exist(err);
        err.should.be.instanceOf(SyntaxError);
        readFile.callCount.should.equal(1);
        done();
      });
    });
    it('setup config returns error', function() {
      var readFile = sinon.stub().callsArgWith(2, new Error('error message'), null);
      var Config = proxyquire('../../lib/client/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.setupConfigData(function(err) {
        should.exist(err);
        err.message.should.equal('error message');
      });
      readFile.callCount.should.equal(1);
    });
    it('setup config return ENOENT', function(done) {
      var err = new Error();
      err.code = 'ENOENT';
      var readFile = sinon.stub().callsArgWith(2, err, null);
      var Config = proxyquire('../../lib/client/config', {
        'fs': {
          readFile: readFile
        }
      });
      var config = new Config({network: 'livenet'});
      config.writeDefaultConfig = sinon.stub().callsArg(0);
      config.setupConfigData(function(err) {
        should.not.exist(err);
        readFile.callCount.should.equal(1);
        config.writeDefaultConfig.callCount.should.equal(1);
        done();
      });
    });
  });
});
