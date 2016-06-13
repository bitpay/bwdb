'use strict';

var chai = require('chai');
var should = chai.should();

var models = require('../../lib/models');
var WalletKey = models.WalletKey;

describe('Key Model', function() {
  describe('@constructor', function() {
    it('will throw error without address', function() {
      (function() {
        var key = new WalletKey();
      }).should.throw(Error);
    });
    it('will set the default cacheHeight to zero', function() {
      var key = new WalletKey({address: '2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br'});
      key.cacheHeight.should.equal(0);
    });
  });
  describe('#toBuffer/#fromBuffer', function() {
    it('will serialize to a buffer', function() {
      var key = new WalletKey({
        address: '2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br',
        privateKey: '906977a061af29276e40bf377042ffbde414e496ae2260bbf1fa9d085637bfff',
        publicKey: '02a1633cafcc01ebfb6d78e39f687a1f0995c62fc95f51ead10a02ee0be551b5dc'
      });
      Buffer.isBuffer(key.toBuffer()).should.equal(true);
    });
    it('roundtrip', function() {
      var key = new WalletKey({
        address: '2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br',
        privateKey: '906977a061af29276e40bf377042ffbde414e496ae2260bbf1fa9d085637bfff',
        publicKey: '02a1633cafcc01ebfb6d78e39f687a1f0995c62fc95f51ead10a02ee0be551b5dc'
      });
      var key2 = WalletKey.fromBuffer(key.toBuffer());
      key2.address.should.equal('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br');
      key2.privateKey.should.equal('906977a061af29276e40bf377042ffbde414e496ae2260bbf1fa9d085637bfff');
      key2.publicKey.should.equal('02a1633cafcc01ebfb6d78e39f687a1f0995c62fc95f51ead10a02ee0be551b5dc');
    });
  });
});


