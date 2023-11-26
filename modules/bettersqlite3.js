const fs = require('fs');

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_IN_MS = 60 * 60 * 1000;

const Kilobytes = 1024;
const Megabytes = 1024 * Kilobytes;
const Gigabytes = 1024 * Megabytes;

const sql_file = process.cwd() + '/sqlite.db';
const db = require('better-sqlite3')(sql_file);
db.pragma('journal_mode = WAL');

//init table
db.prepare(`
    CREATE TABLE IF NOT EXISTS meta (
        id TEXT PRIMARY KEY,
        title TEXT,
        slug TEXT,
        year TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS search_found (
        id TEXT PRIMARY KEY,
        path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS subtitles_files (
        id TEXT,
        lang TEXT,
        title TEXT,
        path TEXT PRIMARY KEY,
        dlpath TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`).run();

const Tables = {
    Meta: 'meta',
    Search: 'search_found',
    Subtitles: 'subtitles_files'
}

setInterval(function(){
    //checkpoint (move data from wal to db)
    // db.pragma('max_page_count = 1')
    // db.pragma('wal_checkpoint(RESTART)');
    // db.exec('VACUUM')
    //check filesize
    const size_bytes = fs.statSync(sql_file).size;
    //const size_megabytes = size_bytes / Megabytes;
    const size_gigabyte = size_bytes / Gigabytes;
    if(size_gigabyte >= 5) {
        const remove_ratio = (size_gigabyte - 4)/size_gigabyte;
        const sql = `
            DELETE FROM subtitles_files
            WHERE id IN (
                SELECT DISTINCT id FROM (
                    SELECT id FROM subtitles_files 
                    ORDER BY updated_at ASC 
                    LIMIT (SELECT CEIL(COUNT(*) * ?) FROM subtitles_files)
                )
            )`;
        const del = db.prepare(sql);
        const result = del.run(remove_ratio);
        console.log('DELETED:', result.changes, 'ROWS')
    } 
}, ONE_HOUR_IN_MS);

function set(table, keys = Array, values = Array, where, value) {
    if(!where) {
        const sql = `INSERT OR IGNORE INTO ${table} (${keys.join(',')}) VALUES (${'?,'.repeat(keys.length - 1)}?)`;
        const insert = db.prepare(sql);
        return insert.run(values);
    } else {
        keys = keys.map(key => `${key} = ?`).join(',');
        const sql = `UPDATE ${table} SET ${keys}, updated_at = CURRENT_TIMESTAMP WHERE ${where} = ?`;
        const update = db.prepare(sql);
        return update.run([...values, value]);
    }
}

function InsertMany(table, keys = Array, values = Array) {
    const insertMany = db.transaction((values) => {
        for(const value  of values) set(table, keys, value);
    });

    insertMany(values);
}

function get(table, wheres = Array, values = Array) {
    wheres = wheres.map(where => `${where} = ?`).join(' AND ');
    const sql = `SELECT * FROM ${table} WHERE ${wheres}`;
    const select  = db.prepare(sql);
    return select.get(values);
}

function getAll(table, wheres = Array, values = Array) {
    wheres = wheres.map(where => `${where} = ?`).join(',');
    const select  = db.prepare(`SELECT * FROM ${table} WHERE ${wheres}`);
    return select.all(values);
}


module.exports = {
    get, set,
    getAll, InsertMany,
    Tables
};