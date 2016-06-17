'use strict';

var chai = require('chai');
var should = chai.should();

var Wallet = require('../lib/index');

describe('Wallet', function() {
  describe('@constructor', function() {
    it('will set node', function() {
      var node = {};
      var wallet = new Wallet({node: node});
      wallet.node.should.equal(node);
    });
  });
  describe('starting service', function() {
    describe('#_getApplicationDir', function() {
      it('will resolve application path based on home directory', function() {
      });
    });
    describe('#_setupApplicationDirectory', function() {
      it('will make directory if the application directory does not exist', function() {
      });
      it('will give unhandled error while trying to access application directory', function() {
      });
      it('will continue if application directory already exists', function() {
      });
    });
    describe('#_getDatabasePath', function() {
      it('will give database path for livenet', function() {
      });
      it('will give database path for regtest', function() {
      });
      it('will give database path for testnet', function() {
      });
      it('will give error with unknown network', function() {
      });
    });
    describe('#_setupDatabase', function() {
      it('will open database from path', function() {
      });
    });
    describe('#_loadWalletData', function() {
      it('will create new wallet at current height if wallet not found', function() {
      });
      it('will give unhandled error for getting wallet data', function() {
      });
      it('will set the wallet reference to wallet data', function() {
      });
      it('will create new wallet txids if not found', function() {
      });
      it('will give unhandled error for getting wallet txids', function() {
      });
      it('will set the wallet refernce to wallet txids', function() {
      });
    });
    describe('#start', function() {
      it('will setup application directory, database and load wallet', function() {
      });
      it('will give error from loading database', function() {
      });
      it('will set the block handler for the wallet', function() {
      });
      it('will call sync', function() {
      });
      it('will register to call sync when there is a new bitcoin tip', function() {
      });
    });
  });
  describe('stopping service', function() {
    describe('#stop', function() {
      it('will call db close if defined', function() {
      });
      it('will continue if db is undefined', function() {
      });
    });
  });
  describe('syncing', function() {
    describe('#_connectBlockAddressDeltas', function() {
      it('will get database key for address', function() {
      });
      it('will skip if address does not exist', function() {
      });
      it('will give error during address database lookup', function() {
      });
      it('will insert txids into walletTxIds', function() {
      });
      it.skip('will update balance of walletData', function() {
      });
    });
    describe('#_connectBlockCommit', function() {
      it('will update walletData with block hash and height', function() {
      });
      it('will create two batch operations for walletTxids and walletData', function() {
      });
      it('will give error from batch', function() {
      });
      it('will batch ops to the database', function() {
      });
      it('will update wallet walletTxids and walletData references', function() {
      });
    });
    describe('#_connectBlock', function() {
      it('will get address deltas from block handler', function() {
      });
      it('will give error from connecting block address deltas', function() {
      });
      it('will commit block', function() {
      });
    });
    describe.skip('#_disconnectTip', function() {
      it('', function() {
      });
    });
    describe('#_isSynced', function() {
      it('will return true if wallet data height matches bitcoin height', function() {
      });
      it('will return false if wallet data height does not match bitcoin height', function() {
      });
    });
    describe('#_updateTip', function() {
      it('will get raw block or the next block height', function() {
      });
      it('will handle error from getting block', function() {
      });
      it('will set block height', function() {
      });
      it('will connect block if next block advances chain', function() {
      });
      it('will handle error while connecting block', function() {
      });
      it('will disconnect block if block does not advance chain', function() {
      });
      it('will handle error while disconnecting block', function() {
      });
    });
    describe('#sync', function() {
      it('will bail out if already syncing', function() {
      });
      it('will bail out if node is stopping', function() {
      });
      it('will bail out if walletData is not available', function() {
      });
      it('will bail out if walletTxids is not available', function() {
      });
      it('will set synced until finished', function() {
      });
      it('will bail out if node is stopping while syncing', function() {
      });
      it('will update tip until height matches', function() {
      });
      it('will emit synced when height matches', function() {
      });
      it('will bail out while stopping and finished syncing', function() {
      });
    });
  });
  describe('api methods', function() {
    describe('importing wallet keys', function() {
      describe('#_checkKeyImported', function() {
        it('it will continue if key is not found', function() {
        });
        it('it will give unexpected error', function() {
        });
        it('will give error if key already exists', function() {
        });
      });
      describe('#_addKeyToWallet', function() {
        it('will handle error from client query', function() {
        });
        it('will insert txids into walletTxids', function() {
        });
        it('will insert address into address filter on walletData', function() {
        });
        it('will update balance on walletData', function() {
        });
      });
      describe('#_commitWalletKey', function() {
        it('will send expected operations to batch command', function() {
        });
        it('will handle error from batch and leave wallet references unchanged', function() {
        });
        it('will update wallet references with updated data', function() {
        });
      });
      describe('#importWalletKey', function() {
        it('will give error if wallet is currency syncing or importing another address', function() {
        });
        it('will set syncing until finished', function() {
        });
        it('will check that key is not imported', function() {
        });
        it('will add key to wallet', function() {
        });
        it('will give error from updating wallet and set syncing to false', function() {
        });
        it('will commit changes to wallet', function() {
        });
        it('will give error from commiting changes to wallet and set syncing to false', function() {
        });
      });
    });
    describe('#_validateFromAndTo', function() {
      it('will throw error if "from" or "to" is not a number', function() {
      });
      it('will throw if "from" is less than "to"', function() {
      });
      it('will throw if range exceeds maximum', function() {
      });
    });
    describe('#getWalletTxids', function() {
      it('will give error if options are invalid', function() {
      });
      it('will give buffers if optinos is set', function() {
      });
      it('will give hex strings as an array', function() {
      });
    });
    describe('#getAPIMethods', function() {
      it('will return expected methods', function() {
      });
    });
  });
  describe('events', function() {
    describe('#getPublishEvents', function() {
      it('will return expected events', function() {
      });
    });
  });
});
