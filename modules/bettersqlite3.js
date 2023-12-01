const Database = require('better-sqlite3');
const fs = require('fs');

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_IN_MS = 60 * 60 * 1000;
const MAX_TBL_ROWS = 100000 * 500; //100.000(movie) * 500(sub/movie)
const SAFE_TBL_ROWS = 90000 * 500;

const MAX_RSS_SAVE_DAYS = 30;

const KILOBYTES = 1024;
const MEGABYTES = 1024 * KILOBYTES;
const GIGABYTES = 1024 * MEGABYTES;

let sql_file = process.cwd() + '/sqlite.db';
var db = require('better-sqlite3')(sql_file);
db.pragma('journal_mode = WAL');

//init table
function init() {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS redirect (
            id TEXT PRIMARY KEY,
            dest TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS rss (
            lang TEXT,
            path TEXT,
            dlpath TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS before_insert_rss
        BEFORE INSERT ON rss
        BEGIN
            DELETE FROM rss
            WHERE updated_at <= DATETIME('now', '-${MAX_RSS_SAVE_DAYS} days');
        END;
    `);

    db.prepare(`
        CREATE TABLE IF NOT EXISTS meta (
            id TEXT PRIMARY KEY,
            title TEXT,
            altername TEXT,
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
            status INTEGER DEFAULT 1,
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
}

init();

const Tables = {
    Redirect: 'redirect',
    RSS: 'rss',
    Meta: 'meta',
    Search: 'search_found',
    Subtitles: 'subtitles_files'
}

//Limit rows (~5-10GB)
setInterval(function(){
    const tbl_rows_count = db.prepare(`SELECT COUNT(*) as count FROM subtitles_files`).get().count;
    if(tbl_rows_count >= MAX_TBL_ROWS) {
        const remove_ratio = (tbl_rows_count - SAFE_TBL_ROWS)/tbl_rows_count;
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
}, ONE_DAY_IN_MS);

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
    wheres = wheres.map(where => `${where} = ?`).join(' AND ');
    const select  = db.prepare(`SELECT * FROM ${table} WHERE ${wheres}`);
    return select.all(values);
}

function del(table, wheres = Array, values = Array) {
    wheres = wheres.map(where => `${where} = ?`).join(' AND ');
    const sql = `DELETE FROM ${table} WHERE ${wheres}`;
    const select  = db.prepare(sql);
    return select.run(values);
}

function fileInfo() {
    const info = fs.statSync(sql_file);
    return info;
}

function loadSQL(path) {
    db.close();
    sql_file = path;
    db = new Database(sql_file);
    db.pragma('journal_mode = WAL');
    init();
}

function forceCheckPoint(type) {
    db.pragma(`wal_checkpoint(${type})`);
}

function getSQLFile() {
    return sql_file;
}

module.exports = {
    get, set, del,
    getAll, InsertMany,
    Tables,
    fileInfo, getSQLFile,
    loadSQL, forceCheckPoint
};