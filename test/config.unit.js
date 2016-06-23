'use strict';

var bitcore = require('bitcore-lib');
var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');

var Config = require('../lib/config');

describe('Wallet Config', function() {

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

});
