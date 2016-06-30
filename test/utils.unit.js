'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var proxyquire = require('proxyquire');

var utils = require('../lib/utils');

describe('Wallet Utils', function() {
  describe('#setupDirectory', function() {
    it('will make directory if the application directory does not exist', function(done) {
      var mkdirp = sinon.stub().callsArg(1);
      var enoentError = new Error();
      enoentError.code = 'ENOENT';
      var access = sinon.stub().callsArgWith(1, enoentError);
      var utils = proxyquire('../lib/utils', {
        'fs': {
          access: access
        },
        'mkdirp': mkdirp
      });
      utils.setupDirectory('/tmp/bwsv2-directory', function(err) {
        if (err) {
          return done(err);
        }
        mkdirp.callCount.should.equal(1);
        access.callCount.should.equal(1);
        done();
      });
    });
    it('will give unhandled error while trying to access application directory', function(done) {
      var mkdirp = sinon.stub().callsArg(1);
      var access = sinon.stub().callsArgWith(1, new Error('test'));
      var utils = proxyquire('../lib/utils', {
        'fs': {
          access: access
        },
        'mkdirp': mkdirp
      });
      utils.setupDirectory('/tmp/bwsv2-directory', function(err) {
        err.should.be.instanceOf(Error);
        err.message.should.equal('test');
        mkdirp.callCount.should.equal(0);
        done();
      });
    });
    it('will continue if application directory already exists', function(done) {
      var mkdirp = sinon.stub().callsArg(1);
      var access = sinon.stub().callsArg(1);
      var utils = proxyquire('../lib/utils', {
        'fs': {
          access: access
        },
        'mkdirp': mkdirp
      });
      utils.setupDirectory('/tmp/bwsv2-directory', function(err) {
        if (err) {
          return done(err);
        }
        mkdirp.callCount.should.equal(0);
        access.callCount.should.equal(1);
        done();
      });
    });
  });
  describe('#splitRange', function() {
    it('will split 1 to 10 by sections of 3', function() {
      var range = utils.splitRange(1, 10, 3);
      range.should.deep.equal([[1, 3], [4, 6], [7, 9], [10, 10]]);
    });
    it('will split 1 to 417769 by sections of 100000', function() {
      var range = utils.splitRange(1, 417769, 100000);
      range.should.deep.equal([[1, 100000], [100001, 200000], [200001, 300000], [300001, 400000], [400001, 417769]]);
    });
    it('will split 1 to 2 by sections of 3 (leaving unchanged)', function() {
      var range = utils.splitRange(1, 2, 3);
      range.should.deep.equal([[1, 2]]);
    });
  });
  describe('#readJSONFile', function() {
    it('', function() {
    });
  });
  describe('#splitArray', function() {
    it('', function() {
    });
  });
  describe('#getRemoteAddress', function() {
    it('', function() {
    });
  });
  describe('#enableCORS', function() {
    it('', function() {
    });
  });
  describe('#sendError', function() {
    it('', function() {
    });
  });
  describe('#createLogStream', function() {
    it('', function() {
    });
  });
  describe('#getTaskId', function() {
    it('', function() {
    });
  });
  describe('#getClients', function() {
    it('', function() {
    });
  });
  describe('#setClients', function() {
    it('', function() {
    });
  });
  describe('#tryAllClients', function() {
    it('', function() {
    });
  });
  describe('#wrapRPCError', function() {
    it('', function() {
    });
  });

});
