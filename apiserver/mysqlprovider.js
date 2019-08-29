let mysql = require('mysql');
let sqlconfig = require("./sqlconfig.json");

const pool = mysql.createPool(sqlconfig);

exports.con = (callback) => {
    pool.getConnection((err,con)=>{
        if (err) { return callback(err)}
        callback(err,con);
    });
};

