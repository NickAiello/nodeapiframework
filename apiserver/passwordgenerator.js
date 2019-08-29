const crypto = require('crypto');
let mysql = require("mysql");
let sqlconfig = require("./sqlconfig.json");
let con = mysql.createConnection(sqlconfig);

let stdout = process.stdout;
let stdin = process.stdin;

if (process.argv.length < 3) {
    console.log("Must enter username as only parameter");
    process.exit(1);
}

let username = process.argv[2];

stdout.write('Enter password: ');
stdin.resume();
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding('utf8');

let backspace = String.fromCharCode(127);
let input = '';
//
stdin.on('data', (ch) => {
    ch = ch.toString('utf8');//convert entered value into utf8
    if (ch === "\n" || ch === "\r" || ch === "\u0004") {
        //user completed password
        stdout.write('\n');
        stdin.setRawMode(false);
        stdin.pause();
        if (validateIt(input)) {
            updateDB(hashIt(username + input));
        }
        return;
    } else if (ch === "\u0003") {
        //ctrl+c pressed, break outta here
        process.exit();
    } else if (ch === "\u0008" || ch === backspace) {
        //on backspace, wipe the line, remove last character of input
        //recreate the prompt from length of the reduced input
        input = input.slice(0, input.length - 1);
        stdout.clearLine();
        stdout.cursorTo(0);
        let ast = "";
        for (let i = 0; i < input.length; i++) {
            ast += "*";
        }
        stdout.write('Enter password: ' + ast);
    } else {
        //character maxed out at 50 characters
        if (input.length < 50) {
            stdout.write('*');
            input += ch;
        }
    }

});

function validateIt(input) {
    if (input === null || input === undefined || input === "" || input === "\n") {
        console.log("Bad input");
        return false;
    }
    return true;
}
function hashIt(input) {
    let hash = crypto.createHash('sha256');
    hash.update(input);
    return hash.digest('hex');
}

function updateDB(password) {
    con.connect(err => {
        if (err) {
            console.log("Error connecting to database:");
            console.error(err);
            process.exit(1);
        }
        con.query(`SELECT username,password FROM users where username='${username}'`, (err, result, fields) => {
            if (err) throw err;
            console.log("Result(" + result.length + ")=", result, "(" + typeof (result) + ")");
            if (result.length == 0) {
                let q = `INSERT INTO users (username,password,token,date) VALUES ('${username}','${password}',NULL,CURRENT_TIMESTAMP);`;
                con.query(q, (err2, result2) => {
                    if (err2) throw err2;
                });
            } else if (result[0]["password"] == password) {
                console.log("Password unchanged.");
            } else if (result[0]["username"] == username) {
                let q = `UPDATE users SET password = '${password}' WHERE username = '${username}';`;
                con.query(q, (err2, result2) => {
                    if (err2) throw err2;
                });
            } else {
                console.error("Something went wrong.");
                console.log(result);
            }
            con.end();
        });
        con.on('error', err => {
            console.log("An error occured:");
            console.error(err);
            con.end();
            process.exit();
        })
    });
}
