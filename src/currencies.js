const http = require('http');
const utils = require('./utils');

const CURRENCIES = { RUB: 1 };
const CURRENCIES_TRANSLATE = {
  'RUB': 'руб',
  'EUR': 'euro',
};
const CURRENCIES_COMPLIANCE = {
  'EU': 'EUR',
  'EURO': 'EUR',
  'US': 'USD',
  'RU': 'RUB',
  'РУБ': 'RUB',
};
const CURRENCY_DEFAULT = 'RUB';

const CB_CURRENCIES_JSON_URL = 'http://www.cbr-xml-daily.ru/daily_json.js';

let endOfDay;

function isDefault(name) {
  return !name || name === CURRENCY_DEFAULT;
}

function normalize(name) {
  name = (name || '').toUpperCase();
  name = CURRENCIES_COMPLIANCE[name] || name;

  return CURRENCIES[name] ? name : '';
}

function getName(name) {
  return CURRENCIES[name] ? name : CURRENCY_DEFAULT;
}

function getValueInDefault(name, value) {
  if (isDefault(name) || !CURRENCIES[name]) {
    return value;
  }

  value = value * CURRENCIES[name];

  // Round to 2 numbers
  value = +(value.toFixed(2));

  return value;
}

function getForOutput(value) {
  const currency = value || CURRENCY_DEFAULT;

  return (CURRENCIES_TRANSLATE[currency] || currency).toLowerCase();
}

function printCurrentCurrencies(cell) {
  const currenciesOutput = Object.keys(CURRENCIES).sort((name1, name2) => {
    return ['EUR', 'USD'].indexOf(name1) !== -1 ? -1 : 1;
  }).reduce((output, name) => {
    if (!isDefault(name)) {
      output += `${ getForOutput(name) }: ${ utils.toFixed(CURRENCIES[name]) } ${ getForOutput() } \n`;
    }

    return output;
  }, '');

  return utils.printToCell(cell, currenciesOutput);
}

/**
 * Get last available currencies from cbr
 */
function updateCurrencies() {
  return new Promise((resolve, reject) => {
    http.get(CB_CURRENCIES_JSON_URL, (res) => {
      const { statusCode } = res;
      let error;

      if (statusCode !== 200) {
        error = new Error('Request Failed.\n' +
                          `Status Code: ${statusCode}`);
      }

      if (error) {
        console.error(error.message);
        res.resume();
        reject(error);
        return;
      }

      let rawData = '';

      res.setEncoding('utf8');
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const currencies = JSON.parse(rawData);

          Object.keys(currencies.Valute).forEach((name) => {
            const currency = currencies.Valute[name];

            CURRENCIES[name] = currency.Value / currency.Nominal;
          });

          console.log('updated currencies:\n', CURRENCIES);
          resolve(CURRENCIES);
        } catch (e) {
          console.error(e.message);
          reject(error);
        }
      });
    });
  });
}

/**
 * Daily update currencies
 */
function runDailyCurrencies() {
  updateCurrencies();

  if (endOfDay) {
    // go to next day
    endOfDay.add(1, 'day');

  // Start timer
  } else {
    endOfDay = utils.time().endOf('day');
  }

  setTimeout(runDailyCurrencies, endOfDay.diff());
}

module.exports.isDefault = isDefault;
module.exports.normalize = normalize;
module.exports.getName = getName;
module.exports.getValueInDefault = getValueInDefault;
module.exports.getForOutput = getForOutput;
module.exports.printCurrentCurrencies = printCurrentCurrencies;
module.exports.updateCurrencies = updateCurrencies;
module.exports.runDailyCurrencies = runDailyCurrencies;
