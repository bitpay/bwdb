'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');

var messages = require('../lib/messages');

describe('Wallet Messages', function() {
  describe('#encodeMessage', function() {
    it('will encode buffer', function() {
      var buffer = messages.encodeMessage(JSON.stringify({hello: 'world'}));
      var magic = new Buffer('e8cfc3e4', 'hex');
      var varint = new Buffer('11', 'hex');
      var payload = new Buffer(JSON.stringify({hello: 'world'}), 'utf8');
      var expected = Buffer.concat([magic, varint, payload]).toString();
      buffer.toString().should.equal(expected);
    });
  });

  describe('#encodeReaderMessage', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will stringify arguments', function() {
      sandbox.stub(messages, 'encodeMessage');
      messages.encodeReaderMessage('abc', null, {hello: 'world'});
      messages.encodeMessage.callCount.should.equal(1);
      messages.encodeMessage.args[0][0].should.equal(JSON.stringify({
        id: 'abc',
        error: null,
        result: {
          hello: 'world'
        }
      }));
    });
  });

  describe('#encodeWriterMessage', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('will stringify arguments', function() {
      sandbox.stub(messages, 'encodeMessage');
      messages.encodeWriterMessage('abc', 'sync', {hello: 'world'}, 1);
      messages.encodeMessage.callCount.should.equal(1);
      messages.encodeMessage.args[0][0].should.equal(JSON.stringify({
        task: {
          id: 'abc',
          method: 'sync',
          params: {
            hello: 'world'
          },
        },
        priority: 1
      }));
    });
  });

  describe('#parser', function() {
    var sandbox = sinon.sandbox.create();
    afterEach(function() {
      sandbox.restore();
    });
    it('should parse two messages', function(done) {
      var msg1 = messages.encodeMessage(JSON.stringify({message: '1'}));
      var msg2 = messages.encodeMessage(JSON.stringify({message: '2'}));
      var data = Buffer.concat([msg1, msg2]);

      var callCount = 0;
      var parser = messages.parser(function(msg) {
        callCount++;
        if (callCount === 1) {
          msg.should.deep.equal({message: '1'});
        } else {
          msg.should.deep.equal({message: '2'});
          done();
        }
      });
      parser(data);
    });
    it('should parse two messages but the data is split', function(done) {
      var msg1 = messages.encodeMessage(JSON.stringify({message: '1'}));
      var msg2 = messages.encodeMessage(JSON.stringify({message: '2'}));

      var data1 = Buffer.concat([msg1, msg2.slice(0, msg2.length - 5)]);
      var data2 = msg2.slice(msg2.length - 5, msg2.length);

      var callCount = 0;
      var parser = messages.parser(function(msg) {
        callCount++;
        if (callCount === 1) {
          msg.should.deep.equal({message: '1'});
        } else {
          msg.should.deep.equal({message: '2'});
          done();
        }
      });
      parser(data1);
      parser(data2);
    });
    it('should parse one message if the data is split', function(done) {
      var msg1 = messages.encodeMessage(JSON.stringify({
        message: 'f36aa80ac16283318a9855c89b8fd05d6c46ee71b9b27b2a77def29ccf9a14a9'
      }));
      var data1 = msg1.slice(0, 20);
      var data2 = msg1.slice(20, msg1.length);
      var parser = messages.parser(function(msg) {
        msg.should.deep.equal({
          message: 'f36aa80ac16283318a9855c89b8fd05d6c46ee71b9b27b2a77def29ccf9a14a9'
        });
        done();
      });
      parser(data1);
      parser(data2);
    });
    it('should parse message if does not start with magic', function(done) {
      var msg1 = messages.encodeMessage(JSON.stringify({message: '1'}));
      var garbage = new Buffer('065a45ac44f6', 'hex');
      var data = Buffer.concat([garbage, msg1]);
      var parser = messages.parser(function(msg) {
        msg.should.deep.equal({message: '1'});
        done();
      });
      parser(data);
    });
    it('should handle data without magic', function() {
      var garbage = new Buffer('065a45ac44f6', 'hex');
      var parser = messages.parser(function() {
        throw new Error('Should not be called');
      });
      parser(garbage);
    });
    it('should log if unable to parse json', function() {
      var msg1 = messages.encodeMessage('not json');
      sandbox.stub(console, 'error');
      var parser = messages.parser(function() {
        throw new Error('Should not be called');
      });
      parser(msg1);
      console.error.callCount.should.equal(1);
    });
  });

});
