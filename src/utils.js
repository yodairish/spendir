const moment = require('moment');
const currencies = require('./currencies');
const Telegram = require('telegraf/telegram');
const TOKEN = require('../configs/token');

const telegram = new Telegram(TOKEN);

const DEFAULT_TIME_ZONE = 3;
const MONEY_PATTERN = /^(\*?[0-9\. ]+)(.*)?/;
// Real limit 4096, but save some for extra
const MESSAGE_LIMIT = 3500;

function time(date) {
  return moment(date).utcOffset(DEFAULT_TIME_ZONE);
}

function datePeriod(period, date) {
  return time(date).startOf(period).toDate();
}

function getSortedTagsByAmount(tags) {
  return Object.keys(tags).sort((tag1, tag2) => {
    return getTagSum(tags[tag1]) < getTagSum(tags[tag2]) ? 1 : -1;
  });
}

function getOutputValue(value) {
  let total = 0;
  let hasNotDedault = false;

  let output = Object.keys(value)
    .map((currency) => {
      const currencyValue = value[currency];

      total += currencies.getValueInDefault(currency, currencyValue);

      hasNotDedault = hasNotDedault || !currencies.isDefault(currency);

      return `${ toFixed(currencyValue) } ${ currencies.getForOutput(currency) }`;
    })
    .join(', ');

  if (hasNotDedault) {
    output += ` (${ toFixed(total) } ${ currencies.getForOutput() })`;
  }

  return output;
}

function toFixed(value) {
  return (value % 1 ? value.toFixed(1) : value);
}

/**
 * Maximum allowed message size is 4096 bytes
 * So to send report even if it's really big(for example for month)
 * We need to split it on chunks
 * Just split by length not good enouth cause it may break one record
 * So slipt output by lines
 */
function splitOutput(output) {
  const parts = [''];

  output.split('\n').forEach((line) => {
    line += '\n';

    if ((parts[parts.length - 1] + line).length > MESSAGE_LIMIT) {
      parts.push('');
    }

    parts[parts.length - 1] += line;
  });

  return parts;
}

function getTagSum(tag) {
  return Object.keys(tag).reduce((sum, currency) => {
    return sum + currencies.getValueInDefault(currency, tag[currency]);
  }, 0);
}

function allocateEntities(text, entities, textOffset) {
  textOffset = textOffset || 0;

  return (entities || []).reduce((result, entity) => {
    const entityOffset = entity.offset + textOffset;

    switch(entity.type) {
      case 'bot_command':
        result.commands.push(result.text.substr(entityOffset, entity.length).toLowerCase());
        result.text = result.text.substring(0, entityOffset) + result.text.substring(entityOffset + entity.length);
        textOffset -= entity.length;
        break;
      case 'hashtag':
        result.tags.push(result.text.substr(entityOffset, entity.length).toLowerCase());
        result.text = result.text.substring(0, entityOffset) + result.text.substring(entityOffset + entity.length);
        textOffset -= entity.length;
        break;
    }

    return result;
  }, { text: text, commands: [], tags: [] })
}

function parseMessage(message, entities) {
  const matches = message.trim().match(MONEY_PATTERN);

  if (!matches) return false;

  const ignoreLimit = matches[1][0] === '*';

  if (ignoreLimit) {
    matches[1] = matches[1].slice(1);
  }

  const amount = +matches[1].trim().replace(/ /g, '');
  let msg = (matches[2] || '').trim();

  // Get currency
  const firstWord = (msg.match(/^[a-z]+/i) || [])[0];
  const currency = currencies.normalize(firstWord);

  if (firstWord && currencies.isCurrency(firstWord)) {
    msg = msg.substr(firstWord.length);
  }

  // Get tags
  const result = allocateEntities(msg, entities, -message.indexOf(msg));

  if (ignoreLimit) {
    result.tags.push('no_limit');
  }

  return {
    amount: amount,
    msg: result.text.trim(),
    currency: currencies.getName(currency),
    tags: result.tags,
    commands: result.commands,
  };
}

function printToCell(cell, output) {
  return splitOutput(output).reduce((prev, part) => {
    return prev.then(() => telegram.sendMessage(cell, part));
  }, Promise.resolve());
}

function rand(min, max) {
  return Math.floor(Math.random() * max) + min;
}

module.exports.time = time;
module.exports.datePeriod = datePeriod;
module.exports.getSortedTagsByAmount = getSortedTagsByAmount;
module.exports.getOutputValue = getOutputValue;
module.exports.splitOutput = splitOutput;
module.exports.parseMessage = parseMessage;
module.exports.printToCell = printToCell;
module.exports.toFixed = toFixed;
module.exports.rand = rand;
module.exports.allocateEntities = allocateEntities;
