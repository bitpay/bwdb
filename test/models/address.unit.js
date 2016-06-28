'use strict';

var chai = require('chai');
var should = chai.should();

var models = require('../../lib/models');
var WalletAddress = models.WalletAddress;

describe('Wallet Address Model', function() {
  describe('@constructor', function() {
    it('will throw error without address', function() {
      (function() {
        var key = new WalletAddress();
      }).should.throw(Error);
    });
  });
  describe('#getKey', function() {
    it('will return database key', function() {
      var key = new WalletAddress({
        address: '2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'
      });
      var dbKey = key.getKey();
      Buffer.isBuffer(dbKey).should.equal(true);
    });
  });
});
