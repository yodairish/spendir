const express = require('express');
const graphs = require('./graphs');

const GRAPH_PORT = 5000;

const app = express();

function pageHTML(props) {
  props = props || {};

  const js = (props.js || []).map((path) => {
    return `<script src="${path}"></script>`;
  });
  const css = (props.css || []).map((path) => {
    return `<link rel="stylesheet" type="text/css" href="${path}" />`;
  });

  return `
<!doctype html>
<head>
  <title>${props.title || 'Spendir bot'}</title>
  <meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0">
  ${css.join('\n')}
  ${js.join('\n')}
</head>
<body>
  ${props.html || ''}
</body>
`;
}

function getMainPage() {
  return {
    html: `
<div style="position: fixed; top: 0; bottom: 0; left: 0; right: 0; margin: auto; text-align: center; font-size: 30px; height: 250px;">
  <p>Простой финансовый бот в Телеграме</p>
  <a href="https://telegram.me/SpendirBot" title="Открыть бота" style="display: inline-block; width: 100px; height: 100px; background-image: url(https://telegram.org/img/t_logo.png); background-size: contain; background-repeat: no-repeat; background-position: center;"></a>
</div>
`
  };
}

app.get('/spend/:hash/', (req, res) => {
  graphs.getPage(req.params.hash)
    .then((page) => pageHTML(page))
    .then((html) => res.send(html))
    .catch((e) => {
      console.log(e);
      res.status(500).send({ error: 'Inner error' });
    });
});

app.get('*', (req, res) => {
  const html = pageHTML(getMainPage());

  res.send(html);
});

app.listen(GRAPH_PORT, '0.0.0.0', (err) => {
  if (err) {
    console.log(err);
    return;
  }

  console.log(`start the server`);
});
