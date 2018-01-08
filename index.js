const moment = require('moment');
moment.locale('ru');

require('./src/currencies').runDailyCurrencies();
require('./src/bot').startPolling();
require('./src/spends').runDailySpends();

require('./src/server');
