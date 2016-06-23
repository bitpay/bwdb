'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var proxyquire = require('proxyquire');

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
});
