'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var proxyquire = require('proxyquire');

describe('Wallet DB', function() {

  describe('#open', function() {
    it('open db instances', function() {
      var open = sinon.stub();
      var openDbi = sinon.stub();
      var ENV = function() {
        return {
          open: open,
          openDbi: openDbi
        };
      };
      var lmdb = {
        Env: ENV
      };
      var db = proxyquire('../lib/db', {
        'node-lmdb': lmdb
      });
      var d = db.open('some db path', true);
      should.exist(d);
    });
  });

  describe('#close', function() {
    it('close the db instances', function() {
      var close = sinon.stub();
      var d = {
        addressesMap: {
          close: close
        },
        addresses: {
          close: close
        },
        wallets: {
          close:close
        },
        txids: {
          close: close
        },
        txs: {
          close: close
        },
        blocks: {
          close:close
        },
        env: {
          close:close
        }
      };
      var db = require('../lib/db');
      var db_ret = db.close(d);
      should.exist(db_ret);
    });
    it('close the db instances', function() {
      var close = sinon.stub();
      var db = require('../lib/db');
      var db_ret = db.close();
      should.not.exist(db_ret);
    });
  });
});
