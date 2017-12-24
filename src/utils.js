const moment = require('moment');

const CONCURRENCY_LIST = ['руб', 'rub', 'euro', 'usd', 'pounds', 'aud'];
const CONCURRENCY_TRANSLATE = { 'rub': 'руб' };
const CONCURRENCY_DEFAULT = 'rub';

const DEFAULT_TIME_ZONE = 3;
const MONEY_PATTERN = /^([0-9\. ]+)(.*)?/;
// Real limit 4096, but save some for extra
const MESSAGE_LIMIT = 3500;

function time(date) {
  return moment(date).utcOffset(DEFAULT_TIME_ZONE);
}

function getOutputConcurrency(value) {
  let concurrency = value || CONCURRENCY_DEFAULT;

  return CONCURRENCY_TRANSLATE[concurrency] || concurrency;
}

function getSortedTagsByAmount(tags) {
  return Object.keys(tags).sort((tag1, tag2) => {
    return getTagSum(tags[tag1]) < getTagSum(tags[tag2]) ? 1 : -1;
  });
}

function getOutputTotal(total) {
  return Object.keys(total)
    .map((concurrency) => {
      const value = (total[concurrency] % 1 ? total[concurrency].toFixed(1) : total[concurrency]);
      return `${value} ${concurrency}`;
    })
    .join(', ');
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
  // Need to put in same concurrency, right now it's stupid
  return Object.keys(tag).reduce((sum, concurrency) => {
    return sum + tag[concurrency];
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
  const matches = message.match(MONEY_PATTERN);

  if (!matches) return false;

  const amount = +matches[1].trim().replace(/ /g, '');
  let msg = (matches[2] || '').trim();

  // Get concurrency
  const firstWord = (msg.match(/^[a-z]+/) || [])[0];

  let concurrency = CONCURRENCY_LIST.find((name) => name.indexOf(firstWord) === 0);

  if (concurrency) {
    msg = msg.substr(firstWord.length);
  } else {
    concurrency = CONCURRENCY_DEFAULT;
  }

  concurrency = Object.keys(CONCURRENCY_TRANSLATE).find((name) => CONCURRENCY_TRANSLATE[name] === concurrency) || concurrency;

  // Get tags
  const result = allocateEntities(msg, entities, -message.indexOf(msg));

  return {
    amount: amount,
    msg: result.text.trim(),
    concurrency: concurrency,
    tags: result.tags,
    commands: result.commands,
  };
}

module.exports.time = time;
module.exports.getOutputConcurrency = getOutputConcurrency;
module.exports.getSortedTagsByAmount = getSortedTagsByAmount;
module.exports.getOutputTotal = getOutputTotal;
module.exports.splitOutput = splitOutput;
module.exports.parseMessage = parseMessage;
