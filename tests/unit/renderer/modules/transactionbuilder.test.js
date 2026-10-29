import {describe, it, expect} from 'vitest';

import Recipient from '../../../../src/app/types/recipient';
import RPCUnspent from '../../../../src/app/types/rpc-unspent';
import TransactionBuilder from '../../../../src/app/modules/transactionbuilder';
import XBridgeInfo from '../../../../src/app/types/xbridgeinfo';

describe('Transaction Builder Test Suite', () => {
  const defaultFeeInfo = new XBridgeInfo({ ticker: 'BLOCK', feeperbyte: 20, mintxfee: 10000, coin: 100000000, dustAmount: 546 });
  const defaultRecipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10, description: '' })];
  const defaultUtxos = [
    new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 15.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
    new RPCUnspent({ txId: 'bcc2478da7e340fe9a80c1230ec5d4fad84b2cd10e1077a6f3573977acc56611', vOut: 1, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 1.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 30 }),
    new RPCUnspent({ txId: '698fd974b4dbe3cc5092646da9d7d4cb02755f7c84968a1b6086e8a4656a4eba', vOut: 0, address: 'yH4uQ3L7jb4Pp3eHQemR6dftyaQrPMXbKz', amount: 1.12345678, scriptPubKey: '76a914dc578b8f1a2e7f73be7dc4845c1d255a9d4d795c88ac', spendable: true, confirmations: 2560 }),
  ];

  const fundedBuilder = () => {
    const builder = new TransactionBuilder(defaultFeeInfo);
    for (const r of defaultRecipients)
      builder.addRecipient(r);
    builder.fundTransaction(defaultUtxos);
    return builder;
  };

  it('TransactionBuilder()', () => {
    const builder = new TransactionBuilder(defaultFeeInfo);
    expect(builder._feeInfo).toBe(defaultFeeInfo);
  });

  it('TransactionBuilder.isValid()', () => {
    expect(fundedBuilder().isValid()).toBe(true);
  });

  it('TransactionBuilder.isValid() should fail without funding the transaction', () => {
    const builder = new TransactionBuilder(defaultFeeInfo);
    for (const r of defaultRecipients)
      builder.addRecipient(r);
    expect(builder.isValid()).toBe(false);
  });

  it('TransactionBuilder.getInputs()', () => {
    const builder = fundedBuilder();
    expect(Array.isArray(builder.getInputs())).toBe(true);
    expect(builder.getInputs()[0]).toBeInstanceOf(RPCUnspent);
  });

  it('TransactionBuilder.getOutputs()', () => {
    const builder = fundedBuilder();
    expect(Array.isArray(builder.getOutputs())).toBe(true);
    expect(builder.getOutputs()[0]).toBeInstanceOf(Recipient);
  });

  it('TransactionBuilder.getTxOutputs()', () => {
    const addresses = [];
    const builder = new TransactionBuilder(defaultFeeInfo);
    for (const r of defaultRecipients) {
      builder.addRecipient(r);
      addresses.push(r.address);
    }
    builder.fundTransaction(defaultUtxos);
    expect(Array.isArray(builder.getTxOutputs())).toBe(true);
    for (const addr of addresses)
      expect(builder.getTxOutputs().some(o => o.address === addr)).toBe(true);
  });

  it('TransactionBuilder.getRecipients() TransactionBuilder.addRecipient()', () => {
    expect(fundedBuilder().getRecipients()).toEqual(defaultRecipients);
  });

  it('TransactionBuilder.getFees()', () => {
    const builder = new TransactionBuilder(defaultFeeInfo);
    for (const r of defaultRecipients)
      builder.addRecipient(r);
    expect(builder.getFees()).toBe(0);
    builder.fundTransaction(defaultUtxos);
    expect(builder.getFees()).toBeGreaterThan(0);
  });

  it('TransactionBuilder.getFees() single utxo', () => {
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 15.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
    ];
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder.addRecipient(new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: utxos[0].amount - 1, description: '' }));
    expect(builder.getFees()).toBe(0);
    builder.fundTransaction(utxos);
    expect(builder.getFees()).toBeGreaterThan(0);
  });

  it('TransactionBuilder.getFees() exact utxo subtract fees', () => {
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 15.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
    ];
    const recipients = [
      new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: utxos[0].amount, description: '' })
    ];
    const builder = new TransactionBuilder(defaultFeeInfo);
    for (const r of recipients)
      builder.addRecipient(r);
    expect(builder.getFees()).toBe(0);
    builder.fundTransaction(utxos, true);
    expect(builder.getFees()).toBeGreaterThan(0);
    expect(builder.getOutputs().length).toBe(1);
    expect(builder.getOutputs()[0].amount).toBe(recipients[0].amount - builder.getFees());
  });

  it('TransactionBuilder.fundTransaction()', () => {
    const builder = new TransactionBuilder(defaultFeeInfo);
    for (const r of defaultRecipients)
      builder.addRecipient(r);
    expect(() => builder.fundTransaction(defaultUtxos)).not.toThrow();
    expect(builder.isValid()).toBe(true);
  });

  it('TransactionBuilder.fundTransaction() single input', () => {
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 15.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
    ];
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder.addRecipient(new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10.12345678, description: '' }));
    expect(() => builder.fundTransaction(utxos)).not.toThrow();
    expect(builder.isValid()).toBe(true);
    expect(builder.getInputs()).toEqual([utxos[0]]); // expecting the larger input to be selected
  });

  it('TransactionBuilder.fundTransaction() multiple inputs', () => {
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 15.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
      new RPCUnspent({ txId: 'bcc2478da7e340fe9a80c1230ec5d4fad84b2cd10e1077a6f3573977acc56611', vOut: 1, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 1.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 30 }),
    ];
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder.addRecipient(new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10.12345678, description: '' }));
    expect(() => builder.fundTransaction(utxos)).not.toThrow();
    expect(builder.isValid()).toBe(true);
    expect(builder.getInputs()).toEqual([utxos[0]]); // expecting the larger input to be selected
  });

  it('TransactionBuilder.fundTransaction() subtract fees from recipients single utxo', () => {
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 15.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
    ];
    const totalAmount = utxos.map(utxo => utxo.amount).reduce((total, cur) => total + cur);
    const recipient1 = new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: totalAmount/2, description: '' });
    const recipient2 = new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: totalAmount/2, description: '' });
    expect(recipient1.isValid()).toBe(true);
    expect(recipient2.isValid()).toBe(true);
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder.addRecipient(recipient1);
    builder.addRecipient(recipient2);
    expect(() => builder.fundTransaction(utxos, true)).not.toThrow();
    expect(builder.isValid()).toBe(true);
    const feesPerRecipient = builder.getFees()/2;
    const outputs = builder.getOutputs();
    expect(outputs.length).toBe(2);
    for (const output of outputs)
      expect(output.amount).toBe(totalAmount/2 - feesPerRecipient); // each recipient shares in fees
  });

  it('TransactionBuilder.fundTransaction() subtract fees from recipients multiple utxos', () => {
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 15.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
      new RPCUnspent({ txId: 'bcc2478da7e340fe9a80c1230ec5d4fad84b2cd10e1077a6f3573977acc56611', vOut: 1, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 1.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 30 }),
    ];
    const totalAmount = utxos.map(utxo => utxo.amount).reduce((total, cur) => total + cur);
    const recipient1 = new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: totalAmount/2, description: '' });
    const recipient2 = new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: totalAmount/2, description: '' });
    expect(recipient1.isValid()).toBe(true);
    expect(recipient2.isValid()).toBe(true);
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder.addRecipient(recipient1);
    builder.addRecipient(recipient2);
    expect(() => builder.fundTransaction(utxos, true)).not.toThrow();
    expect(builder.isValid()).toBe(true);
    const feesPerRecipient = builder.getFees()/2;
    const outputs = builder.getOutputs();
    expect(outputs.length).toBe(2);
    for (const output of outputs)
      expect(output.amount).toBe(totalAmount/2 - feesPerRecipient); // each recipient shares in fees
  });

  it('TransactionBuilder.fundTransaction() Algo A', () => {
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 1.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
      new RPCUnspent({ txId: 'bcc2478da7e340fe9a80c1230ec5d4fad84b2cd10e1077a6f3573977acc56611', vOut: 1, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 5.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 30 }),
      new RPCUnspent({ txId: 'bcc2478da7e340fe9a80c1230ec5d4fad84b2cd10e1077a6f3573977acc56611', vOut: 2, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 5.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 30 }),
    ];
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder.addRecipient(new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10.24691356, description: '' }));
    expect(() => builder.fundTransaction(utxos)).not.toThrow();
    expect(builder.isValid()).toBe(true);
    const sortfn = (a, b) => {
      if (a.txId !== b.txId)
        return a.txId.localeCompare(b.txId);
      return a.vOut < b.vOut ? -1 : (a.vOut > b.vOut ? 1 : 0);
    };
    expect(builder.getInputs().sort(sortfn)).toEqual(utxos.sort(sortfn)); // expecting all to be selected
  });

  it('TransactionBuilder.fundTransaction() Algo B', () => {
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 100.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
      new RPCUnspent({ txId: 'bcc2478da7e340fe9a80c1230ec5d4fad84b2cd10e1077a6f3573977acc56611', vOut: 1, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 90.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: false, confirmations: 30 }),
      new RPCUnspent({ txId: 'bcc2478da7e340fe9a80c1230ec5d4fad84b2cd10e1077a6f3573977acc56611', vOut: 2, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 50.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 30 }),
      new RPCUnspent({ txId: 'bcc2478da7e340fe9a80c1230ec5d4fad84b2cd10e1077a6f3573977acc56611', vOut: 3, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 9.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 30 }),
      new RPCUnspent({ txId: 'bcc2478da7e340fe9a80c1230ec5d4fad84b2cd10e1077a6f3573977acc56611', vOut: 4, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 5.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 30 }),
    ];
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder.addRecipient(new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10.12345678, description: '' }));
    expect(() => builder.fundTransaction(utxos)).not.toThrow();
    expect(builder.isValid()).toBe(true);
    expect(builder.getInputs()).toEqual([utxos[2]]); // expecting the largest utxo above recipient amount
  });

  it('TransactionBuilder.fundTransaction() should fail on bad inputs', () => {
    const builder = new TransactionBuilder(defaultFeeInfo);
    for (const r of defaultRecipients)
      builder.addRecipient(r);
    expect(() => builder.fundTransaction(null)).toThrow();
    expect(() => builder.fundTransaction(undefined)).toThrow();
    expect(() => builder.fundTransaction({})).toThrow();
    expect(() => builder.fundTransaction('')).toThrow();
  });

  it('TransactionBuilder.fundTransaction() should fail on no inputs', () => {
    const builder = new TransactionBuilder(defaultFeeInfo);
    for (const r of defaultRecipients)
      builder.addRecipient(r);
    expect(() => builder.fundTransaction([])).toThrow();
  });

  it('TransactionBuilder.fundTransaction() should fail on not enough inputs', () => {
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 1.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
      new RPCUnspent({ txId: 'bcc2478da7e340fe9a80c1230ec5d4fad84b2cd10e1077a6f3573977acc56611', vOut: 1, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 2.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 30 }),
      new RPCUnspent({ txId: 'bcc2478da7e340fe9a80c1230ec5d4fad84b2cd10e1077a6f3573977acc56611', vOut: 2, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 3.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 30 }),
    ];
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder.addRecipient(new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10.12345678, description: '' }));
    expect(() => builder.fundTransaction(utxos)).toThrow();
  });

  it('TransactionBuilder.fundTransaction() should succeed on exact match', () => {
    const recipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 11.12345678, description: '' })];
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 11.1235678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
    ];
    const builder = new TransactionBuilder(defaultFeeInfo);
    for (const r of recipients)
      builder.addRecipient(r);
    expect(() => builder.fundTransaction(utxos)).not.toThrow();
    expect(builder.isValid()).toBe(true);
    expect(builder.getInputs()).toEqual(utxos);
    // 1102 sats of change, above BLOCK's 546 threshold, so it is returned.
    expect(builder.getOutputs()).toEqual(recipients.concat([
      new Recipient({ address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 0.00001102, description: '' })
    ]));
  });

  it('TransactionBuilder.fundTransaction() should succeed on only 1 utxo with change', () => {
    const recipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10.12345678, description: '' })];
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 11.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
    ];
    const builder = new TransactionBuilder(defaultFeeInfo);
    for (const r of recipients)
      builder.addRecipient(r);
    expect(() => builder.fundTransaction(utxos)).not.toThrow();
    expect(builder.isValid()).toBe(true);
    expect(builder.getInputs()).toEqual(utxos);
    const fee = builder.feeEstimate(utxos.length, recipients.length + 1); // +1 for change
    builder._addChangeIfNecessary(utxos[0].amount, recipients[0].amount + fee, 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', recipients);
    expect(builder.getOutputs()).toEqual(recipients);
  });

  it('TransactionBuilder.fundTransaction() should fail on non-spendable inputs', () => {
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 11.12345678, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: false, confirmations: 525 }),
    ];
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder.addRecipient(new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10.12345678, description: '' }));
    expect(() => builder.fundTransaction(utxos)).toThrow();
    expect(builder.isValid()).toBe(false);
  });

  it('TransactionBuilder.fundTransaction() should fail on dust inputs', () => {
    const dustAmount = defaultFeeInfo.dustAmount/defaultFeeInfo.coin;
    const utxos = [
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: dustAmount, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
      new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 1, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: dustAmount, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 }),
    ];
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder.addRecipient(new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10.12345678, description: '' }));
    expect(() => builder.fundTransaction(utxos)).toThrow();
    expect(builder.isValid()).toBe(false);
  });

  it('TransactionBuilder.feeEstimate()', () => {
    const feeInfo = new XBridgeInfo({ ticker: 'BLOCK', feeperbyte: 20, mintxfee: 1000, coin: 100000000 });
    const builder = new TransactionBuilder(feeInfo);
    expect(builder.feeEstimate(1, 1)).toBe(4520/feeInfo.coin); // 192 * inputCount + 34 * outputCount * feePerByte
    expect(builder.feeEstimate(1, 2)).toBe(5200/feeInfo.coin);
    expect(builder.feeEstimate(2, 2)).toBe(9040/feeInfo.coin);
  });

  it('TransactionBuilder.feeEstimate() default xbridge info', () => {
    const feeInfo = new XBridgeInfo({});
    const builder = new TransactionBuilder(null);
    expect(builder.feeEstimate(1, 1)).toBe(22600/feeInfo.coin);
    expect(builder.feeEstimate(1, 2)).toBe(26000/feeInfo.coin);
    expect(builder.feeEstimate(2, 2)).toBe(45200/feeInfo.coin);
  });

  it('TransactionBuilder.isDust()', () => {
    const feeInfo = new XBridgeInfo({ ticker: 'BLOCK', feeperbyte: 20, mintxfee: 10000, coin: 100000000, dustAmount: 546 });
    const builder = new TransactionBuilder(feeInfo);
    expect(builder.isDust(100/feeInfo.coin)).toBe(true);
    expect(builder.isDust(545/feeInfo.coin)).toBe(true);
    expect(builder.isDust(546/feeInfo.coin)).toBe(false);
    expect(builder.isDust(10000/feeInfo.coin)).toBe(false);
  });

  it('TransactionBuilder.isDust() with a configured zero threshold rejects nothing', () => {
    // 0 is Firo's real value: its source has no dust rule, so nothing is dust.
    const feeInfo = new XBridgeInfo({ ticker: 'FIRO', feeperbyte: 20, mintxfee: 10000, coin: 100000000, dustAmount: 0 });
    const builder = new TransactionBuilder(feeInfo);
    expect(builder.isDust(1/feeInfo.coin)).toBe(false);
  });

  it('TransactionBuilder.isDust() with a missing threshold rejects nothing', () => {
    // A missing dustAmount means no dust gate, the daemon's DustAmount=0
    // semantics; it must gate nothing and not throw.
    const feeInfo = new XBridgeInfo({ ticker: 'BLOCK', feeperbyte: 20, mintxfee: 10000, coin: 100000000 });
    const builder = new TransactionBuilder(feeInfo);
    expect(builder.isDust(1)).toBe(false);
  });

  it('TransactionBuilder.isDust() honours a six-decimal coin factor', () => {
    const feeInfo = new XBridgeInfo({ ticker: 'XVG', feeperbyte: 20, mintxfee: 10000, coin: 1000000, dustAmount: 10000 });
    const builder = new TransactionBuilder(feeInfo);
    expect(builder.isDust(9999/feeInfo.coin)).toBe(true);
    expect(builder.isDust(10000/feeInfo.coin)).toBe(false);
  });

  it('TransactionBuilder._addChangeIfNecessary()', () => {
    const recipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10.12345678, description: '' })];
    const builder = new TransactionBuilder(defaultFeeInfo);
    const recipientsPlusChange = recipients.concat([new Recipient({ address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 20, description: '' })]);
    builder._addChangeIfNecessary(120.12345678, 100.12345678, 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', recipients);
    expect(recipients).toEqual(recipientsPlusChange);
  });

  it('TransactionBuilder._addChangeIfNecessary() should fail if change is dust', () => {
    const recipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10, description: '' })];
    const recipientsCopy = recipients;
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder._addChangeIfNecessary(100, 120, 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', recipients);
    expect(recipients).toEqual(recipientsCopy);
    builder._addChangeIfNecessary(100, 100, 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', recipients);
    expect(recipients).toEqual(recipientsCopy);
    builder._addChangeIfNecessary(100, 100-(defaultFeeInfo.dustAmount/defaultFeeInfo.coin), 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', recipients);
    expect(recipients).toEqual(recipientsCopy);
  });

  it('TransactionBuilder.fundTransaction() should fail on a dust recipient amount', () => {
    // Below the coin's threshold the output cannot be relayed, so building it
    // would only move the failure to the broadcast. 546 is the boundary on this
    // fixture's coin: 545 is dust, 546 is not.
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder.addRecipient(new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: (defaultFeeInfo.dustAmount - 1) / defaultFeeInfo.coin, description: '' }));
    expect(() => builder.fundTransaction(defaultUtxos)).toThrow(/Transaction amount too small/);
    expect(builder.isValid()).toBe(false);
  });

  it('TransactionBuilder.fundTransaction() should accept a recipient exactly at the dust threshold', () => {
    const builder = new TransactionBuilder(defaultFeeInfo);
    builder.addRecipient(new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: defaultFeeInfo.dustAmount / defaultFeeInfo.coin, description: '' }));
    builder.fundTransaction(defaultUtxos);
    expect(builder.isValid()).toBe(true);
  });

  it('TransactionBuilder.fundTransaction() should fail when the fee shaves a recipient into dust', () => {
    // Send-max: the fee is deducted from the recipient, so an amount that starts
    // above the threshold can end below it. Reported as the post-fee case, the
    // same distinction the wallet makes.
    const builder = new TransactionBuilder(defaultFeeInfo);
    const amount = defaultFeeInfo.dustAmount / defaultFeeInfo.coin;
    builder.addRecipient(new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount, description: '' }));
    const utxos = [new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 })];
    expect(() => builder.fundTransaction(utxos, true)).toThrow(/after the fee has been deducted/);
  });
});
