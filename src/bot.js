const Telegraf = require('telegraf');
const db = require('./db');
const spends = require('./spends');
const currencies = require('./currencies');
const links = require('./links');
const settings = require('./settings');
const utils = require('./utils');
const TOKEN = require('../configs/token');

const bot = new Telegraf(TOKEN);

bot.command(['day', 'day@SpendirBot'], (ctx) => {
  spends.getData(ctx.message.chat.id, 'day')
    .then((data) => spends.print(ctx.message.chat.id, data))
    .catch((e) => console.log(e));
});

bot.command(['week', 'week@SpendirBot'], (ctx) => {
  spends.getData(ctx.message.chat.id, 'week')
    .then((data) => spends.print(ctx.message.chat.id, data))
    .catch((e) => console.log(e));
});

bot.command(['month', 'month@SpendirBot'], (ctx) => {
  spends.getData(ctx.message.chat.id, 'month')
    .then((data) => spends.print(ctx.message.chat.id, data))
    .catch((e) => console.log(e));
});

bot.command(['currency', 'currency@SpendirBot'], (ctx) => {
  currencies.printCurrentCurrencies(ctx.message.chat.id)
    .catch((e) => console.log(e));
});

bot.command(['graphs', 'graphs@SpendirBot'], (ctx) => {
  links.generateNewLink(ctx.message.chat.id)
    .then((info) => {
      ctx.reply(`https://spendir.ru/spend/${info.hash}/\nСсылка активна до ${info.activeTo}`);
    })
    .catch((e) => {
      console.log(e);
      ctx.reply('Неудалось создать ссылку, попробуйте еще раз');
    });
});

bot.command(['limit', 'limit@SpendirBot'], (ctx) => {
  const text = ctx.message.text.trim().slice(6).trim();

  if (text) {
    const limit = +text;

    if (limit >= 0) {
      settings.setLimit(ctx.message.chat.id, limit)
        .then(() => ctx.reply('Новый лимит установлен'))
        .catch(() => ctx.reply('Неудалось установить лимит'));
    } else {
      ctx.reply('Указан неверный лимит');
    }
  } else {
    ctx.reply('Нужно указать лимит');
  }
});

bot.command(['limit_only', 'limit_only@SpendirBot'], (ctx) => {
  const result = utils.allocateEntities(ctx.message.text, ctx.message.entities);

  if (result.tags.length) {
    settings.setLimitOnly(ctx.message.chat.id, result.tags)
      .then(() => ctx.reply('Установленны теги для лимита'));
  } else if (result.text.trim() === '-') {
    settings.setLimitOnly(ctx.message.chat.id, [])
      .then(() => ctx.reply('Убраные теги для лимита'));
  } else {
    ctx.reply('Нужно указать теги');
  }
});

bot.command(['limit_except', 'limit_except@SpendirBot'], (ctx) => {
  const result = utils.allocateEntities(ctx.message.text, ctx.message.entities);

  if (result.tags.length) {
    settings.setLimitExcept(ctx.message.chat.id, result.tags)
      .then(() => ctx.reply('Установленны исключающие теги для лимита'));
  } else if (result.text.trim() === '-') {
    settings.setLimitExcept(ctx.message.chat.id, [])
      .then(() => ctx.reply('Убраные исключающие теги для лимита'));
  } else {
    ctx.reply('Нужно указать теги');
  }
});

bot.on('edited_message', (ctx) => {
  const message = ctx.update.edited_message;

  if (message.from.is_bot || !message.text) return;

  const result = utils.parseMessage(message.text, message.entities);

  db.spend
    .findOne({
      cell: message.chat.id,
      messageId: message.message_id,
    })
    .then((record) => {
      if (result && !result.commands.length) {
        if (record) {
          spends.update(ctx, record, result);
        } else {
          spends.add(ctx, message, result);
        }
      } else if (record) {
        spends.remove(ctx, record);
      }
    });
});

bot.on('message', (ctx) => {
  const message = ctx.message;

  if (message.from.is_bot || !message.text) return;

  const result = utils.parseMessage(message.text, message.entities);

  if (!result || !result.amount || result.commands.length) {
    ctx.reply('Неправильный формат\nФормат: <сумма> (сообщение)');
    return;
  }

  spends.add(ctx, message, result);
});

module.exports = bot;
