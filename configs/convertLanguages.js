const languages = require('./languages.json');
const fs = require('fs');

let langs = {};

Object.values(languages).forEach(x => {
    langs[x.name] = x.id;
})

fs.writeFileSync('./convertLanguages.json', JSON.stringify(langs, null, 2));
