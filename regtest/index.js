'use strict';

var chai = require('chai');
var bitcore = require('bitcore-lib');
var BitcoinRPC = require('bitcoind-rpc');
var rimraf = require('rimraf');
var should = chai.should();

var index = require('..');
var Server = index.Server;
var Client = index.Client;
var Config = index.Config;

var testWIF = 'cSdkPxkAjA4HDr5VHgsebAPDEh9Gyub4HK8UJr2DFGGqKKy4K5sG';
var testKey = bitcore.PrivateKey(testWIF);
var bitcoinClient;
var server;
var client;

describe('Wallet Server & Client', function() {

  var regtest;

  before(function(done) {
    this.timeout(10000);

    var configPath = __dirname + '/data';

    rimraf(configPath + '/bitcoin/regtest', function(err) {

      if (err) {
        throw err;
      }

      server = new Server({network: 'regtest', configPath: configPath});

      var config = new Config({network: 'regtest', path: configPath});
      var url = config.getURLSync();
      client = new Client({network: 'regtest', url: url});

      regtest = bitcore.Networks.get('regtest');
      should.exist(regtest);

      server.on('error', function(err) {
        console.error(err);
      });

      server.start(function(err) {
        if (err) {
          return done(err);
        }

        bitcoinClient = new BitcoinRPC({
          protocol: 'http',
          host: '127.0.0.1',
          port: 30331,
          user: 'bitcoin',
          pass: 'local321',
          rejectUnauthorized: false
        });

        var syncedHandler = function(height) {
          if (height >= 150) {
            server.node.services.bitcoind.removeListener('synced', syncedHandler);
            done();
          }
        };

        server.node.services.bitcoind.on('synced', syncedHandler);
        bitcoinClient.generate(150, function(err) {
          if (err) {
            throw err;
          }
        });
      });
    });
  });

  after(function(done) {
    this.timeout(20000);
    server.stop(function(err) {
      if (err) {
        throw err;
      }
      done();
    });
  });

  var walletId = 'f4c4dd2e316dd51f962dba79816f4f36e1b371f81e9c33be456ed091c4107d3a';
  it('will create a wallet', function(done) {
    client.createWallet(walletId, function(err, result) {
      if (err) {
        return done(err);
      }
      done();
    });
  });
  it('will import an address', function(done) {
    var address = testKey.toAddress().toString();
    client.importAddress(walletId, address, function(err, result) {
      if (err) {
        return done(err);
      }
      should.exist(result);
      done();
    });
  });

});
