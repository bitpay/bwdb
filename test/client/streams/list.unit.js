'use strict';

var chai = require('chai');
var should = chai.should();
var _ = require('lodash');

var ListStream = require('../../../lib/client/streams/list');
var testData = require('../../data/list.json');

describe('Wallet Client Transaction List Stream', function() {
  describe('@constructor', function() {
    var walletId = 'f84e34cd25131cefb6392b43e00ee19f45b510376d556406950603bf0f1e5982';
    var client = {};
    function checkProperties(stream, showBitcoinAmount) {
      should.exist(stream);
      stream._walletId.should.equal('f84e34cd25131cefb6392b43e00ee19f45b510376d556406950603bf0f1e5982');
      stream._client.should.equal(client);
      stream._limit.should.equal(100);
      stream._showBitcoinAmount.should.equal(showBitcoinAmount);
      stream._end.should.equal(1001);
      stream._position.should.deep.equal({
        height: 1000,
        index: 12
      });
      should.equal(stream._bitcoinHeight, null);
    }
    it('will create an instance', function() {
      var stream = new ListStream(walletId, {
        client: client,
        limit: 100,
        height: 1000,
        index: 12,
        end: 1001
      });
      checkProperties(stream, false);
    });
    it('will create an instance (without new)', function() {
      var stream = ListStream(walletId, {
        client: client,
        limit: 100,
        height: 1000,
        index: 12,
        end: 1001
      });
      checkProperties(stream, false);
    });
    it('configure bitcoin as amounts', function() {
      var stream = new ListStream(walletId, {
        client: client,
        limit: 100,
        height: 1000,
        index: 12,
        end: 1001,
        showBitcoinAmount: true
      });
      checkProperties(stream, true);
    });
  });
  describe('#_transactionToList', function() {
    var walletId = 'f84e34cd25131cefb6392b43e00ee19f45b510376d556406950603bf0f1e5982';
    var client = {};
    testData.forEach(function(data) {
      it('will transform transaction to list (' + data.comment + ')', function() {
        var options = {
          client: client,
          limit: 100,
          height: 1000,
          index: 12,
          end: 1000
        };
        _.extend(options, data.options);
        var stream = new ListStream(walletId, options);
        stream._bitcoinHeight = 105006;
        var list = stream._transactionToList(data.transaction);
        list.should.deep.equal(data.list);
      });
    });
  });
  describe('#_startArray', function() {
  });
  describe('#_endArray', function() {
  });
  describe('#_read', function() {
  });
});
