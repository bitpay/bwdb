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
      var Env = function() {
        return {
          open: open,
          openDbi: openDbi
        };
      };
      var lmdb = {
        Env: Env
      };
      var db = proxyquire('../lib/db', {
        'node-lmdb': lmdb
      });
      var d = db.open('some db path', true);
      should.exist(d);
      openDbi.callCount.should.equal(9);
      open.callCount.should.equal(1);
      open.args[0][0].path.should.equal('some db path');
      open.args[0][0].maxDbs.should.equal(15);
      open.args[0][0].mapSize.should.equal(1099511627776);
      open.args[0][0].maxReaders.should.equal(126);
      open.args[0][0].noMetaSync.should.equal(true);
      open.args[0][0].noSync.should.equal(true);
    });
    it('open db instances (read only)', function() {
      var open = sinon.stub();
      var openDbi = sinon.stub();
      var Env = function() {
        return {
          open: open,
          openDbi: openDbi
        };
      };
      var lmdb = {
        Env: Env
      };
      var db = proxyquire('../lib/db', {
        'node-lmdb': lmdb
      });
      var d = db.open('some db path', true);
      should.exist(d);
      openDbi.callCount.should.equal(9);
      for (var i = 0; i < 9; i++) {
        openDbi.args[i][0].create.should.equal(false);
      }
      open.callCount.should.equal(1);
      open.args[0][0].readOnly.should.equal(true);
    });
    it('open db instances (read and write)', function() {
      var open = sinon.stub();
      var openDbi = sinon.stub();
      var Env = function() {
        return {
          open: open,
          openDbi: openDbi
        };
      };
      var lmdb = {
        Env: Env
      };
      var db = proxyquire('../lib/db', {
        'node-lmdb': lmdb
      });
      var d = db.open('some db path', false);
      should.exist(d);
      openDbi.callCount.should.equal(9);
      for (var i = 0; i < 9; i++) {
        openDbi.args[i][0].create.should.equal(true);
      }
      open.callCount.should.equal(1);
      open.args[0][0].readOnly.should.equal(false);
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
        blocks: {
          close:close
        },
        txs: {
          close: close
        },
        utxos: {
          close: close
        },
        utxosBySatoshis: {
          close: close
        },
        utxosByHeight: {
          close: close
        },
        env: {
          close:close
        }
      };
      var db = require('../lib/db');
      var ret = db.close(d);
      should.exist(ret);
      close.callCount.should.equal(10);
    });
    it('close the db instances', function() {
      var db = require('../lib/db');
      var ret = db.close();
      should.not.exist(ret);
    });
  });
});
