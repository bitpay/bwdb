'use strict';

var bitcore = require('bitcore-lib');

var exports = {};

var MAGIC_BUFFER = new Buffer('e8cfc3e4', 'hex');

exports.encodeMessage = function(json) {
  var writer = bitcore.encoding.BufferWriter();
  writer.write(MAGIC_BUFFER);
  writer.writeVarintNum(json.length);
  writer.write(new Buffer(json, 'utf8'));
  return writer.toBuffer();
};

exports.encodeReaderMessage = function(id, error, result) {
  var json = JSON.stringify({
    id: id,
    error: error,
    result: result
  });
  return exports.encodeMessage(json);
};

exports.encodeWriterMessage = function(taskId, method, params, priority) {
  var json = JSON.stringify({
    task: {
      id: taskId,
      method: method,
      params: params
    },
    priority: priority
  });
  return exports.encodeMessage(json);
};

exports.parser = function(callback) {
  var buffer = new Buffer(new Array(0));

  function seek() {
    var pos = 0;
    while (pos < buffer.length) {
      var magic = buffer.slice(pos, pos + MAGIC_BUFFER.length);
      if (magic.compare(MAGIC_BUFFER) === 0) {
        buffer = buffer.slice(pos, buffer.length);
        return true;
      }
      pos += 1;
    }
    return false;
  }

  function read() {
    var reader = bitcore.encoding.BufferReader(buffer);

    reader.read(MAGIC_BUFFER.length);
    var length = reader.readVarintNum();

    var json;
    if (buffer.length >= length + MAGIC_BUFFER.length) {
      var jsonBuffer = reader.read(length);
      buffer = reader.readAll();
      try {
        json = JSON.parse(jsonBuffer.toString('utf8'));
      } catch(e) {
        console.error('Unable to JSON parse writer message');
      }
    }
    if (json) {
      callback(json);
    }
    if (buffer.length > 0) {
      setImmediate(parse);
    }
  }

  function parse(data) {
    if (data) {
      buffer = Buffer.concat([buffer, data]);
    }
    if (seek() && buffer.length > 0) {
      read();
    }
  }

  return parse;
};

module.exports = exports;
