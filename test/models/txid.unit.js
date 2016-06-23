'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');

var models = require('../../lib/models');
var WalletTxid = models.WalletTxid;

describe('Wallet Txids Model', function() {
  describe('@constructor', function() {
    it('contruct new element', function() {
      var txids = new WalletTxid();
      should.exist(txids);
    });
  });
});
