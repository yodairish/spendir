const db = require('./db');

function getLimit(cell) {
	const limit = { amount: 0, only: [], except: [] };

	if (!cell) {
    return Promise.resolve(limit);
  }

  return db.settings.findOne({
      cell: cell
    })
    .then((settings) => {
      if (!settings.limit) {
        return limit;
      }

			limit.amount = settings.limit;

			if (settings.limitOnly && settings.limitOnly.length) {
				limit.only = settings.limitOnly;
			} else if (settings.limitExcept && settings.limitExcept.length) {
				limit.except = settings.limitExcept;
			}

			return limit;
    });
}

function setLimit(cell, limit) {
	if (!cell || !Number.isInteger(limit) || limit < 0) {
    return Promise.reject();
  }

	return db.settings.findOne({
      cell: cell,
    })
    .then((settings) => {
      if (settings) {
				return settings.update({ limit: limit });
      } else {
				return new db.settings({
					cell: cell,
					limit: limit,
				}).save();
      }
    });
}

function setLimitOnly(cell, only) {
	if (!cell || !only) {
    return Promise.reject();
  }

	if (typeof only === 'string') {
		only = [only];
	}

	if (!Array.isArray) {
		return Promise.reject();
	}

	return db.settings.findOne({
      cell: cell,
    })
    .then((settings) => {
      if (settings) {
				return settings.update({ limitOnly: only });
      } else {
				return new db.settings({
					cell: cell,
					limitOnly: only,
				}).save();
      }
    });
}

function setLimitExcept(cell, except) {
	if (!cell || !except) {
    return Promise.reject();
  }

	if (typeof except === 'string') {
		except = [except];
	}

	if (!Array.isArray) {
		return Promise.reject();
	}

	return db.settings.findOne({
      cell: cell,
    })
    .then((settings) => {
      if (settings) {
				return settings.update({ limitExcept: except });
      } else {
				return new db.settings({
					cell: cell,
					limitExcept: except,
				}).save();
      }
    });
}

module.exports.getLimit = getLimit;
module.exports.setLimit = setLimit;
module.exports.setLimitOnly = setLimitOnly;
module.exports.setLimitExcept = setLimitExcept;
