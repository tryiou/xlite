import {MAX_DECIMAL_CURRENCY} from '../constants';
import Localize from '../components/shared/localize';

import _ from 'lodash';
import {all, create} from 'mathjs';

const math = create(all, {
  number: 'BigNumber',
  precision: 64
});
const { bignumber } = math;

export const handleError = err => {
  console.error(err);
};

/**
 * Wallets array sorting function
 */
export const walletSorter = balances => (a, b) =>  {
  const { ticker: tickerA, name: nameA } = a;
  const [ totalA ] = balances.has(tickerA) ? balances.get(tickerA) : ['0'];
  const { ticker: tickerB, name: nameB } = b;
  const [ totalB ] = balances.has(tickerB) ? balances.get(tickerB) : ['0'];
  if (tickerA === 'BLOCK') // always on top
    return -1;
  // sort descending by balance amount
  if (Number(totalA) === Number(totalB))
    return Localize.compare(nameA, nameB);
  else
    return Number(totalB) - Number(totalA);
};

export const unixTime = () => {
  return Math.floor(new Date() / 1000);
};

export const multiplierForCurrency = (ticker, currency, currencyMultipliers) => {
  if (_.has(currencyMultipliers, ticker) && _.has(currencyMultipliers[ticker], currency))
    return currencyMultipliers[ticker][currency];
  return 0;
};

/**
 * Rounds the value up to the next cent.
 * @param val {number|string|bignumber}
 * @return {string} Two decimal places precision
 */
export const currencyLinter = val => {
  if (_.isNull(val) || _.isUndefined(val))
    val = 0;
  if (_.isString(val) && !/^[\d\\.]+$/.test(val)) // if not a string number
    val = 0;
  if (isNaN(Number(val)))
    val = 0;
  const bn = bignumber(val);
  if (bn.toNumber() > 0 && bn.toNumber() < 1/100) // 0.01 is the smallest
    return bignumber(1/100).toFixed(MAX_DECIMAL_CURRENCY);
  return bn.toFixed(MAX_DECIMAL_CURRENCY);
};

export const timeout = length => new Promise(resolve => setTimeout(resolve, length));

export const oneHourSeconds = 3600;
export const oneDaySeconds = 86400;
export const oneWeekSeconds = 604800;
export const oneMonthSeconds = 2592000;
export const halfYearSeconds = 15768000;
export const oneYearSeconds = 31536000;

export const oneSat = 1 / 100000000;

export const passwordValidator = {
  checkLength: password => password.length >= 8,
  checkLowercase: password => password.toUpperCase() !== password,
  checkUppercase: password => password.toLowerCase() !== password,
  checkNumber: password => /\d/.test(password),
  checkSpecial: password => /[^\s\w\d]/.test(password)
};
