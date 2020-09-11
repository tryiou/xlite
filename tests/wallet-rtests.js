/* global describe,it,beforeEach */
/*eslint quotes: 0, key-spacing: 0*/
import should from 'should';

import './rtests';
import domStorage from '../src/app/modules/dom-storage';
import FakeApi, {resolvePromise} from './fake-api';
import {localStorageKeys} from '../src/app/constants';
import Recipient from '../src/app/types/recipient';
import RPCTransaction from '../src/app/types/rpc-transaction';
import Token from '../src/app/types/token';
import {unixTime} from '../src/app/util';
import Wallet from '../src/app/types/wallet-r';
import XBridgeInfo from '../src/app/types/xbridgeinfo';
import {publicPath} from '../src/app/util/public-path-r';

describe('Wallet Test Suite', function() {
  const appStorage = domStorage;
  let token;
  let walletData;
  const fakeApi = window.api;
  const sortFn = (a,b) => a.txId.localeCompare(b.txId);

  beforeEach(function() {
    appStorage.clear();
    token = new Token({
      "blockchain": "Blocknet",
      "ticker": "BLOCK",
      "ver_id": "blocknet--v4.0.1",
      "ver_name": "Blocknet v4",
      "conf_name": "blocknet.conf",
      "dir_name_linux": "blocknet",
      "dir_name_mac": "Blocknet",
      "dir_name_win": "Blocknet",
      "repo_url": "https://github.com/blocknetdx/blocknet",
      "versions": [
        "v4.3.0"
      ],
      "xbridge_conf": "blocknet--v4.0.1.conf",
      "wallet_conf": "blocknet--v4.0.1.conf"
    });
    token.xbinfo = new XBridgeInfo({ ticker: 'BLOCK', feeperbyte: 20, mintxfee: 10000, coin: 100000000, rpcport: 41414 });
    walletData = {ticker: token.ticker, name: token.blockchain, _token: token};
    Object.assign(fakeApi, FakeApi(fakeApi));
  });

  it('Wallet()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    wallet._token.should.be.eql(token);
    wallet._storage.should.be.eql(appStorage);
    wallet.ticker.should.be.equal(token.ticker);
    wallet.name.should.be.equal(token.blockchain);
    wallet.imagePath.should.be.equal(Wallet.getImage(wallet.ticker));
    await wallet.rpcEnabled().should.finally.be.true();
  });
  it('Wallet.rpcEnabled()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    await wallet.rpcEnabled().should.finally.be.true();
    should.not.exist(wallet.rpc);
    fakeApi.wallet_rpcEnabled = () => resolvePromise(false);
    const wallet2 = new Wallet(fakeApi, appStorage, walletData);
    await wallet2.rpcEnabled().should.finally.be.false();
  });
  it('Wallet.blockchain()', function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    wallet.blockchain().should.be.equal(token.blockchain);
  });
  it('Wallet.token()', function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    wallet.token().should.be.eql(token);
  });
  it('Wallet.getBalance()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const balance = await wallet.getBalance();
    balance.should.be.eql(await fakeApi.wallet_getBalance(wallet.ticker));
  });
  it('Wallet.getTransactions()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const fakeTxs = await fakeApi.wallet_getTransactions(wallet.ticker);
    await wallet.updateTransactions();
    const txs = wallet.getTransactions().sort(sortFn);
    txs.should.be.eql(fakeTxs.map(o => new RPCTransaction(o)).sort(sortFn));
  });
  it('Wallet.getTransactions() with timeframe', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const startTime = 1596654100;
    const endTime = 1596654200;
    const fakeTxs = await fakeApi.wallet_getTransactions(wallet.ticker, startTime, endTime);
    await wallet.updateTransactions();
    const txs = wallet.getTransactions(startTime, endTime).sort(sortFn);
    txs.should.be.eql(fakeTxs.map(o => new RPCTransaction(o)).sort(sortFn));
  });
  it('Wallet.getTransactions() no transactions outside timeframe', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const startTime = 1596654201;
    const endTime = 1596654300;
    await wallet.updateTransactions();
    const txs = wallet.getTransactions(startTime, endTime);
    txs.should.be.eql([]);
  });
  it('Wallet.getTransactions() timeframe with same start and end', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const fakeTxs1 = await fakeApi.wallet_getTransactions(wallet.ticker);
    const startTime = fakeTxs1[0].time;
    const endTime = fakeTxs1[0].time;
    await wallet.updateTransactions();
    const txs = wallet.getTransactions(startTime, endTime).sort(sortFn);
    const fakeTxs2 = await fakeApi.wallet_getTransactions(wallet.ticker, startTime, endTime);
    txs.should.be.eql(fakeTxs2.map(o => new RPCTransaction(o)).sort(sortFn));
    txs.length.should.be.equal(1); // expecting only 1 transaction
  });
  it('Wallet.updateTransactions()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const fakeTxs = await fakeApi.wallet_getTransactions(wallet.ticker);
    await wallet.updateTransactions().should.finally.be.true();
    const txs = wallet.getTransactions().sort(sortFn);
    txs.should.be.eql(fakeTxs.map(o => new RPCTransaction(o)).sort(sortFn));
  });
  it('Wallet.updateTransactions() should not update too soon', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    await wallet.updateTransactions().should.finally.be.true();
    await wallet.updateTransactions().should.finally.be.false(); // no update too soon
  });
  it('Wallet._needsTransactionUpdate()', function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    wallet._needsTransactionUpdate().should.be.true();
    wallet._setLastTransactionFetchTime(unixTime());
    wallet._needsTransactionUpdate().should.be.false();
  });
  it('Wallet._getLastTransactionFetchTime()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    wallet._getLastTransactionFetchTime().should.be.equal(0); // check default state
    await wallet.updateTransactions();
    const fetchTime = appStorage.getItem(wallet._getTransactionFetchTimeStorageKey());
    wallet._getLastTransactionFetchTime().should.be.equal(fetchTime);
  });
  it('Wallet._getLastTransactionFetchTime() negative fetch time should be 0', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    appStorage.setItem(wallet._getTransactionFetchTimeStorageKey(), -1000);
    wallet._getLastTransactionFetchTime().should.be.equal(0);
  });
  it('Wallet._setLastTransactionFetchTime()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    wallet._setLastTransactionFetchTime(2500);
    appStorage.getItem(wallet._getTransactionFetchTimeStorageKey()).should.be.equal(2500);
  });
  it('Wallet._setLastTransactionFetchTime() when less than 0 should set 0', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    wallet._setLastTransactionFetchTime(-1000);
    appStorage.getItem(wallet._getTransactionFetchTimeStorageKey()).should.be.equal(0);
  });
  it('Wallet._getTransactionStorageKey()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    wallet._getTransactionStorageKey().should.be.equal(localStorageKeys.TRANSACTIONS + '_' + wallet.ticker);
  });
  it('Wallet._getTransactionFetchTimeStorageKey()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    wallet._getTransactionFetchTimeStorageKey().should.be.equal(localStorageKeys.TX_LAST_FETCH_TIME + '_' + wallet.ticker);
  });
  it('Wallet._getTransactionsFromStorage()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const fakeTxs = await fakeApi.wallet_getTransactions(wallet.ticker);
    await wallet.updateTransactions();
    wallet._getTransactionsFromStorage(0, 5000000000).sort(sortFn).should.be.eql(fakeTxs.map(o => new RPCTransaction(o)).sort(sortFn));
  });
  it('Wallet._getTransactionsFromStorage() end less than start should set end=start', async function() {
    fakeApi.wallet_getTransactions = (ticker) => {
      return [
        new RPCTransaction({ txId: 'A', address: 'afjdsakjfksdajk', amount: 10.000, time: 1000 }),
        new RPCTransaction({ txId: 'B', address: 'afjdsakjfksdajk', amount: 10.000, time: 2000 }),
        new RPCTransaction({ txId: 'c', address: 'afjdsakjfksdajk', amount: 10.000, time: 3000 }),
      ];
    };
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    await wallet.updateTransactions();
    wallet._getTransactionsFromStorage(1000, 900).sort(sortFn).should.be.eql([new RPCTransaction((await fakeApi.wallet_getTransactions(wallet.ticker))[0])]);
  });
  it('Wallet._addTransactionsToStorage()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const fakeTxs = await fakeApi.wallet_getTransactions(wallet.ticker);
    await wallet.updateTransactions();
    const addTxs = [
      new RPCTransaction({ txId: 'A', address: 'afjdsakjfksdajk', amount: 10.000 }),
      new RPCTransaction({ txId: 'B', address: 'afjdsakjfksdajk', amount: 11.000 }),
    ];
    wallet._addTransactionsToStorage(addTxs).should.be.true();
    wallet.getTransactions().sort(sortFn).should.eql(fakeTxs.map(o => new RPCTransaction(o)).concat(addTxs).sort(sortFn));
  });
  it('Wallet._addTransactionsToStorage() should not update non-array', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const fakeTxs = await fakeApi.wallet_getTransactions(wallet.ticker);
    await wallet.updateTransactions();
    wallet._addTransactionsToStorage({}).should.be.false();
    wallet.getTransactions().sort(sortFn).should.eql(fakeTxs.map(o => new RPCTransaction(o)).sort(sortFn));
  });
  it('Wallet._addTransactionsToStorage() should not include duplicates', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const fakeTxs = await fakeApi.wallet_getTransactions(wallet.ticker);
    await wallet.updateTransactions();
    const addTxs = [
      new RPCTransaction({ txId: 'A', address: 'afjdsakjfksdajk', amount: 10.000 }),
      new RPCTransaction({ txId: 'B', address: 'afjdsakjfksdajk', amount: 11.000 }),
    ];
    const duplTxs = [
      new RPCTransaction({ txId: 'A', address: 'afjdsakjfksdajk', amount: 10.000 }),
      new RPCTransaction({ txId: 'B', address: 'afjdsakjfksdajk', amount: 11.000 }),
    ];
    wallet._addTransactionsToStorage(addTxs.concat(duplTxs)).should.be.true();
    wallet.getTransactions().sort(sortFn).should.eql(fakeTxs.map(o => new RPCTransaction(o)).concat(addTxs).sort(sortFn));
  });
  it('Wallet._fetchTransactions()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const fakeTxs = (await fakeApi.wallet_getTransactions(wallet.ticker))
                      .map(o => new RPCTransaction(o)).sort(sortFn);
    const fetchTime = unixTime();
    (await wallet._fetchTransactions()).sort(sortFn).should.be.eql(fakeTxs);
    wallet.getTransactions().should.eql(fakeTxs);
    wallet._getLastTransactionFetchTime().should.be.greaterThanOrEqual(fetchTime);
  });
  it('Wallet._fetchTransactions() should not update server txs if endtime < last_fetch_time', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const addTxs = [
      new RPCTransaction({ txId: 'A', address: 'afjdsakjfksdajk', amount: 10.000, time: 10000 }),
      new RPCTransaction({ txId: 'B', address: 'afjdsakjfksdajk', amount: 11.000, time: 10000 }),
    ];
    wallet._addTransactionsToStorage(addTxs).should.be.true();
    wallet._setLastTransactionFetchTime(20000);
    (await wallet._fetchTransactions(0, 19000)).sort(sortFn).should.be.eql(addTxs.sort(sortFn));
  });
  it('Wallet._fetchTransactions() should return existing txs on rpc error', async function() {
    fakeApi.wallet_getTransactions = (ticker) => { throw new Error(''); };
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const addTxs = [
      new RPCTransaction({ txId: 'A', address: 'afjdsakjfksdajk', amount: 10.000, time: 10000 }),
      new RPCTransaction({ txId: 'B', address: 'afjdsakjfksdajk', amount: 11.000, time: 10000 }),
    ];
    wallet._addTransactionsToStorage(addTxs).should.be.true();
    (await wallet._fetchTransactions()).sort(sortFn).should.be.eql(addTxs.sort(sortFn));
  });
  it('Wallet._fetchTransactions() should not throw on rpc error', async function() {
    fakeApi.wallet_getTransactions = () => { throw new Error(''); };
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    should.doesNotThrow(await wallet._fetchTransactions, Error);
  });
  it('Wallet.getAddresses()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const fakeAddrs = await fakeApi.wallet_getAddresses(wallet.ticker);
    const addrs = await wallet.getAddresses();
    addrs.should.be.eql(fakeAddrs);
  });
  it('Wallet.generateNewAddress()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const addr = await wallet.generateNewAddress();
    addr.should.be.a.String().and.not.equal('');
  });
  it('Wallet.getCachedUnspent()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const fakeUtxos = await fakeApi.wallet_getCachedUnspent(wallet.ticker);
    await wallet.getCachedUnspent(60).should.finally.be.eql(fakeUtxos);
  });
  it('Wallet.getExplorerLinkForTx()', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    wallet.getExplorerLinkForTx('a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0')
      .should.be.equal('https://chainz.cryptoid.info/block/tx.dws?a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0.htm')
  });
  it('Wallet.send() should succeed', async function() {
    const wallet = new Wallet(fakeApi, appStorage, walletData);
    const recipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 50, description: '' })];
    const txid = await wallet.send(recipients);
    should.exist(txid);
    txid.should.be.equal(await fakeApi.wallet_send(wallet.ticker));
  });
});