'use strict';

var chai = require('chai');
var should = chai.should();
var bitcore = require('bitcore-lib');

var models = require('../../lib/models');
var WalletAddress = models.WalletAddress;

describe('Wallet Address Model', function() {
  function checkAddress(key) {
    key.address.toString().should.equal('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
    key.walletId.toString('hex').should.equal('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7');
  }
  function checkAddressJSON(key) {
    key.address.should.equal('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
    key.walletId.should.equal('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7');
  }
  var walletId = new Buffer('b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7', 'hex');
  describe('@constructor', function() {
    it('throw error without address', function() {
      (function() {
        var key = new WalletAddress();
      }).should.throw(Error);
    });
    it('with address', function() {
      var key = new WalletAddress(walletId, bitcore.Address('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'));
      should.exist(key);
      checkAddress(key);
    });
    it('with strings', function() {
      var key = new WalletAddress(
        'b4f97411dadf3882296997ade99f4a0891b07e768a76898b837ac41d2c2622e7',
        '2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
      should.exist(key);
      checkAddress(key);
    });
  });
  describe('#getKey', function() {
    it('will return database key', function() {
      var key = new WalletAddress(walletId, '2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
      var dbKey = key.getKey();
      Buffer.isBuffer(dbKey).should.equal(true);
      var expectedKey = walletId.toString('hex');
      expectedKey += '02';
      expectedKey += '6349a418fc4578d10a372b54b45c280cc8c4382f';
      dbKey.toString('hex').should.equal(expectedKey);
    });
  });
  describe('#getValue', function() {
    it('will return empty buffer (expect to store additional info later)', function() {
      var key = new WalletAddress(walletId, '2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
      var dbKey = key.getValue();
      Buffer.isBuffer(dbKey).should.equal(true);
      dbKey.length.should.equal(0);
    });
  });
  describe('@fromBuffer', function() {
    it('will parse buffer', function() {
      var keyHex = walletId.toString('hex');
      keyHex += '02';
      keyHex += '6349a418fc4578d10a372b54b45c280cc8c4382f';
      var key = WalletAddress.fromBuffer(new Buffer(keyHex, 'hex'), new Buffer(new Array(0)), bitcore.Networks.testnet);
      should.exist(key);
    });
  });
  describe('#toJSON', function() {
    it('will transform to JSON', function() {
      var key = new WalletAddress(walletId, bitcore.Address('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'));
      checkAddressJSON(JSON.parse(JSON.stringify(key)));
    });
  });
});
