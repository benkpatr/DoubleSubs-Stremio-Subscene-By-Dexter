const db = require('better-sqlite3')(process.cwd() + '/sqlite.db');

//init table
db.prepare(`
    CREATE TABLE IF NOT EXISTS meta (
        id TEXT PRIMARY KEY,
        title TEXT,
        slug TEXT,
        year TEXT
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS search_found (
        id TEXT PRIMARY KEY,
        path TEXT
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS subtitles_files (
        id TEXT,
        lang TEXT,
        title TEXT,
        path TEXT,
        dlpath TEXT,
        PRIMARY KEY (id, lang, title, path)
    )
`).run();

const Tables = {
    Meta: 'meta',
    Search: 'search_found',
    Subtitles: 'subtitles_files'
}



function set(table, keys = Array, values = Array, where, value) {
    if(!where) {
        values = values.map(value => `'${value}'`);
        const insert = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${values.join(',')})`);
        return insert.run();
    } else {
        keys = keys.map((key, i) => `${key} = '${values[i]}'`);
        const update = db.prepare(`UPDATE ${table} SET (${keys.join(',')}) WHERE ${where} = '${value}'`);
        return update.run();
    }
}

function get(table, where, value) {
    const select  = db.prepare(`SELECT * FROM ${table} WHERE ${where} = '${value}'`);
    return select.get();
}

function getAll(table, where, value) {
    const select  = db.prepare(`SELECT * FROM ${table} WHERE ${where} = '${value}'`);
    return select.all();
}


module.exports = {
    get, set,
    getAll,
    Tables
};