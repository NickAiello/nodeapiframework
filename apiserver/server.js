const AWS = require("aws-sdk");
const express = require('express');
const fs = require('fs');
const app = express();
const https = require('https');
const hostZoneIdRegex = RegExp('^[a-zA-z0-9]{10,15}$');
const ipRegex = RegExp('^([0-9]{1,3}\.){3}[0-9]{1,3}$');
const domainRegex = RegExp('^([a-zA-Z0-9][a-zA-Z0-9\-]{1,61}[a-zA-Z0-9]\.)([a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]\.){1,5}[a-zA-Z]{1,3}\.?$');
const validNameRegex = RegExp('^[a-zA-Z0-9][a-zA-Z0-9\-]{1,61}[a-zA-Z0-9]$');
const passwordValidator = RegExp('^[a-zA-Z0-9\-\_!@#$%^&*?+=]{1,50}$');
const crypto = require('crypto');
const utf8 = require('utf8');
const options = require("./opts.json") || require("options.json") || require("conf.json");
let port = options.port || 8080;//default port 8080
let sslflag = options.useSSL || true;//SSL on or off
let sslcert = options.sslcert || undefined;//location of the 
const httpsOptions = {}//it kinda pisses me off that javascript changed what "const" means compared to what everyone expects
if (sslflag === true) {
    httpsOptions.pfx = fs.readFileSync(sslcert);
}

let mysqlpool = require('./mysqlprovider');

//writes objects to file as JSON
function write_json_file(name, data, dir = "./.cache/") {
    if (!fs.existsSync(dir)) {//check if dir exists
        fs.mkdirSync(dir);//make if not
    }
    fs.writeFile(dir + name + ".json", JSON.stringify(data, null, 1), 'utf8', function (err, data) {
        if (err) {
            console.error("Error for [" + name + "] writing file!", err);
        }
    });
    return;
}

function check_cache(name, dir = "./.cache/") {
    // TODO: decide what validating the cache means
    // TODO: code whatever validating the cache means
    return;
}

class authentication {
    constructor() {
        //list of users that have been validated and there token.
        //skip DB auth, local server cache
        //probably a security risk technically, but this application doesn't follow a single paradigm
        //so good luck figuring out how anything is stored
        //also, password lookups always go to DB and never get stored here
        this.userTokenMap = {};
    }

    generatePasswordHash(salt, pass) {
        salt = utf8.encode(salt);//force utf8 encoding before attempting to create the hash
        pass = utf8.encode(pass);
        let temphash = crypto.createHash('sha256');
        temphash.update(salt + pass);//salt is the username since it just has to be non-unique. Weak, but system non-critical
        return temphash.digest('hex');//stored as hex in the DB, easy for comparison
    }

    generateNewToken(callback) {
        crypto.randomBytes(64, (err, buf) => {
            if (err) { return; }
            callback(buf.toString('hex'));
        });
    }

    //this function is called by the API endpoints just to confirm the token is a-okay
    validateToken(input, callback) {
        let resp = { msg: "", token: null, error: false, valid: false };
        let user = {};
        //pull the return items out of the input
        try {
            user.name = input.name;
            user.token = input.token || null;
        } catch (err) {
            console.err(err);
            resp.valid = false;
            resp.msg = "An Error occured validating input parameters.";
            resp.error = true;
            callback(resp);
            return;
        }

        if (user.token in this.userTokenMap) {
            resp.valid = true;
            resp.msg = "Token validated from cache.";
            callback(resp);
            return;
        } else if (user.token !== "") {
            //con.connect(err => {
            mysqlpool.con((err, con) => {
                if (err) { console.error(err); return; }
                let q = `SELECT username,token,date FROM users WHERE token='${user.token}'`;
                //console.log(q);
                con.query(q, (err, result) => {
                    if (err) {
                        console.error(err);
                        resp.valid = false;
                        resp.msg = "An Error occured validating input parameters.";
                        resp.error = true;
                        callback(resp);
                        return;
                    }
                    //console.log("Result=",result[0],"User.token=",user.token);
                    if (result[0] && "token" in result[0] && user.token === result[0].token) {
                        resp.valid = true;
                        resp.msg = "Valid token";
                    } else {
                        resp.valid = false;
                        resp.msg = "Invalid token";
                    }
                    callback(resp);
                    con.release();
                });
            });
        } else {
            resp.valid = false;
            resp.msg = "No Token provided or it was of invalid format.";
            callback(resp);
        }
    }

    //validate the user
    validateUser(input, callback) {
        let user = {};
        let resp = { msg: "", token: null, error: false, valid: false };
        //pull the return items out of the input
        try {
            user.name = input.name;
            user.token = input.token;
        } catch (err) {
            console.err(err);
            resp.valid = false;
            resp.msg = "An Error occured validating input parameters.";
            resp.error = true;
            callback(resp);
            return;
        }
        //setup response object, sent back to the caller containing validity of the request and user info

        //validate the password then generate the salted hash
        if (input["pass"] && passwordValidator.test(input["pass"])) {
            user.pass = this.generatePasswordHash(user.name, input.pass);
        } else {
            resp.mesg = "Validation of the password failed. Encountered an unexpected character.";
            resp.valid = false;
            resp.error = true;
            callback(resp);//send back invalid paramets
            return;
        }
        if (user.token != '' && user.token != null && user.token != undefined) {
            //con.connect(err => {
            mysqlpool.con((err, con) => {
                if (err) {
                    console.error(err);
                    resp.valid = false;
                    resp.msg = "Database connection error.";
                    resp.error = true;
                    con.release();
                    return;
                }
                let q = `SELECT token,password,date FROM users WHERE username='${user.name}'`;
                con.query(q, (err, result) => {
                    if (err) {
                        console.error(err);
                        resp.valid = false;
                        resp.msg = "Database query error.";
                        resp.error = true;
                        callback(resp);
                        con.release();
                        return;
                    }
                    if (result[0].token != null && result[0].token != undefined && result[0].token != '' && user.token === result[0].token) {
                        resp.msg = "Token validated";
                        resp.valid = true;
                        this.userTokenMap[result[0].token] = user.name;
                    }
                    callback(resp);
                    con.release();
                });
            });
        } else if (user.name != "" && user.pass != "") {
            mysqlpool.con((err, con) => {
                if (err) {
                    console.error(err);
                    resp.valid = false;
                    resp.msg = "Database connection error.";
                    resp.error = true;
                    callback(resp);
                    con.release();
                    return;
                }
                let q = `SELECT token,password,date FROM users WHERE username='${user.name}'`;
                con.query(q, (err, result) => {
                    if (err) {
                        console.error(err);
                        resp.valid = false;
                        resp.msg = "Database query error.";
                        resp.error = true;
                        callback(resp);
                        con.release();
                        return;
                    }
                    if (result[0].password === user.pass) {
                        resp.valid = true;
                        resp.msg = "Successful auth.";
                        this.generateNewToken(data => {
                            let updatesql = `UPDATE users SET token='${data}',date=CURRENT_TIMESTAMP WHERE username='${user.name}';`;
                            con.query(updatesql, (err2, result2) => {
                                if (err2) {
                                    console.error(err2);
                                    con.release();
                                    return;
                                }
                                con.release();
                            });
                            resp.token = data;
                            this.userTokenMap[data] = user.name;
                            callback(resp);
                        });
                    } else {
                        resp.valid = false;
                        resp.msg = "Invalid credentials";
                        callback(resp);
                        con.release();
                        return;
                    }
                });
            });
        } else {
            resp.msg = "Something went wrong with the request. Contact your system administrator.";
            resp.valid = false;
            callback(resp);
            con.release();
            return;
        }
    }
    updatePassword(input, callback) {
        let user = {};
        let resp = { msg: "", error: false };
        //pull the return items out of the input
        try {
            user.name = input.name;
        } catch (err) {
            console.err(err);
            resp.msg = "An Error occured validating input parameters.";
            resp.error = true;
            callback(resp);
            return;
        }
        //setup response object, sent back to the caller containing validity of the request and user info

        //validate the password then generate the salted hash
        if (input["pass"] && passwordValidator.test(input["pass"]) && input["newpass"] && passwordValidator.test(input["newpass"])) {
            user.pass = this.generatePasswordHash(user.name, input.pass);
            user.newpass = this.generatePasswordHash(user.name, input.newpass);
        } else {
            resp.msg = "Validation of the password failed. Encountered an unexpected character.";
            resp.error = true;
            callback(resp);//send back invalid paramets
            return;
        }
        mysqlpool.con((err, con) => {
            if (err) {
                console.error(err);
                resp.msg = "Database connection error.";
                resp.error = true;
                callback(resp);
                con.release();
                return;
            }
            let q = `SELECT password FROM users WHERE username='${user.name}'`;
            con.query(q, (err, result) => {
                if (err) {
                    console.error(err);
                    resp.msg = "Database query error.";
                    resp.error = true;
                    callback(resp);
                    con.release();
                    return;
                }
                //console.log(result[0].password, "=", user.newpass);
                if (result[0].password && result[0].password === user.newpass) {
                    resp.msg = "New password matches old password. No changes have been made.";
                    resp.error = true;
                    callback(resp);
                    con.release();
                    return;
                } else if (result[0].password && result[0].password === user.pass) {
                    let updatesql = `UPDATE users SET password='${user.newpass}',date=CURRENT_TIMESTAMP WHERE username='${user.name}';`;
                    con.query(updatesql, (err2, result2) => {
                        if (err2) {
                            console.error(err2);
                            resp.msg = "Database query error.";
                            resp.error = true;
                            callback(resp);
                            con.release();
                            return;
                        }
                        resp.msg = "Credentials have been updated.";
                        callback(resp);
                        con.release();
                    });
                } else {
                    resp.error = true;
                    resp.msg = "Invalid credentials";
                    callback(resp);
                    con.release();
                    return;
                }
            });
        });
    }

}

//how to use:
//let x = new awsfunctions();//automatically logs into AWS from the constructor
//x.listHostedZones().then( data => { doStuff(data) } );//passes back the AWS promise
class awsfunctions {
    constructor(cache = './.cache/', profile = 'default') {
        this.login(profile);
        this.cache = cache;
        this.route53 = new AWS.Route53();
    }

    get getcache() {
        return this.cache;
    }

    async updatecache() {
        return listHostedZones().then(data => {
            write_json_file("listHostedZones", JSON.stringify(data));
            return data;
        });
    }

    login(profile = 'default') {
        let credentials = new AWS.SharedIniFileCredentials({ profile: profile });
        AWS.config.credentials = credentials;
    }

    listHostedZones() {
        return this.route53.listHostedZones().promise();
    }

    listResourceRecordSets(zoneId, startRec = "") {
        if (typeof zoneId != 'string' || !hostZoneIdRegex.test(zoneId)) {
            return new Promise((resolve, reject) => {
                reject("Error: zoneId must be a string");
            });
        } else {
            var params = {
                HostedZoneId: zoneId
            }
            if (startRec !== "") {
                params["StartRecordName"] = startRec;//add start record only when specified
            }
            return this.route53.listResourceRecordSets(params).promise();
        }
    }
    changeResourceRecordSets(data) {
        //console.log("Data length = " + data.length);
        let uniqueZones = {};
        let errorlist = [];
        //console.log(data);
        for (let i = 0; i < data.length; i++) {
            if (!domainRegex.test(data[i].name)) {
                errorlist.push(data[i].name);
                //console.log(data[i].name + " Failed validation");
                continue;
            }
            if (!uniqueZones[data[i].zoneId]) {
                uniqueZones[data[i].zoneId] = {
                    ChangeBatch: {
                        Changes: []
                    },
                    HostedZoneId: data[i].zoneId
                };
            }
            if (domainRegex.test(data[i].targetName)) {//validate ip address
                uniqueZones[data[i].zoneId].ChangeBatch.Changes.push(
                    {
                        Action: "UPSERT",
                        ResourceRecordSet: {
                            AliasTarget: {
                                DNSName: data[i].targetName,
                                EvaluateTargetHealth: false,
                                HostedZoneId: data[i].targetZoneId
                            },
                            Name: data[i].name,
                            Type: "A"
                        }
                    }
                );
            } else if (ipRegex.test(data[i].targetName)) {//validate FQDN
                uniqueZones[data[i].zoneId].ChangeBatch.Changes.push(
                    {
                        Action: "UPSERT",
                        ResourceRecordSet: {
                            Name: data[i].name,
                            ResourceRecords: [
                                {
                                    Value: data[i].targetName
                                }
                            ],
                            TTL: 60,
                            Type: "A"
                        }
                    }
                );
            } else {
                console.error(data[i].name + " Failed validation because the target was invalid: " + data[i].targetName + "(" + ipRegex.test(data[i].targetName) + ")");
                errorlist.push(data[i].name);
            }
        }
        let returnObj = { calls: [], errors: errorlist };
        let plist = [];
        for (let i in uniqueZones) {
            plist.push(this.route53.changeResourceRecordSets(uniqueZones[i]).promise());
            //console.log(i + "\n" + JSON.stringify(uniqueZones[i]) + "\n");
        }
        //console.log("Errors: " + errorlist);
        return Promise.all(plist).then(data => {
            return new Promise((resolve, reject) => {
                returnObj["calls"] = data;
                resolve(returnObj);
            });
        });
    }
}

let myfunctions = new awsfunctions();//prepare AWS calls
let auth = new authentication();
//example of how to run the auth. Uses a callback to provide the authentication object
//resp.token is the string
//resp.valid = true | false where false = user is not logged in
// auth.validateUser({ name: 'naiello', token: '', pass: "abc123" }, resp => {
//     console.log("Received Response:", resp);
// });

//setup headers
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('X-XSS-Protection', 1);
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, password, authtoken, user");
    next();
});

app.post('/auth', (req, res) => {
    const response = { status: "Success", msg: "", token: null };
    let input = {};
    let rawinput = req.query;
    if (typeof (rawinput) !== 'object') {
        response.status = "failed";
        response.msg = "Provided parameters are not JSON.";
        res.send(response);
    } else {
        if (rawinput.username && rawinput.password) {
            input.name = rawinput.username;
            input.pass = rawinput.password;
            auth.validateUser(input, resp => {
                if (resp.error) {
                    response.token = null;
                    response.msg = "An error occurred validating your password.";
                    response.status = resp.msg;
                } else {
                    response.token = resp.token;
                    response.msg = resp.msg;
                    response.status = "Success";
                }
                res.send(response);
            });
        } else {
            response.status = "failed";
            response.msg = "Invalid credentials";
            res.send(response);
        }
    }
});


app.post('/updatePassword', (req, res) => {
    const response = { status: "Success", msg: "", token: null };
    let input = {};
    let rawinput = req.query;
    if (typeof (rawinput) !== 'object') {
        response.status = "Failed";
        response.msg = "Provided parameters are not JSON.";
        rseponse.error = true;
        res.send(response);
    } else {
        //console.log(rawinput);
        if (rawinput.username && rawinput.newpassword && rawinput.currentpassword) {
            input.name = rawinput.username;
            input.newpass = rawinput.newpassword;
            input.pass = rawinput.currentpassword;
            auth.updatePassword(input, resp => {
                if (resp.error) {
                    response.msg = resp.msg;
                    response.status = "Failed";
                } else {
                    response.msg = resp.msg;
                    response.status = "Success";
                }
                response.error = resp.error;
                res.send(response);
            });
        } else {
            response.status = "Failed";
            response.msg = "Invalid credentials";
            response.error = resp.error;
            res.send(response);
        }
    }
});

//base url response
app.get('/', (req, res) => res.send("Hello World. I come from the great beyond!"));
//set /listHostedZones response
app.get('/listHostedZones', function (req, res, next) {
    const response = { error: null, msg: "" };
    let input = {};
    //console.log(req.headers);
    input.token = req.headers.authtoken;

    auth.validateToken(input, (resp) => {
        if (resp.valid !== true) {
            response.error = "Invalid Token.";
            response.msg = "An invalid token was sent to the server. Try clearing your cookies and logging in again.";
            res.send(response);
        } else {
            if (req.query.force == "true" || !fs.existsSync(myfunctions.getcache + 'listHostedZones.json')) {
                res.header('custom-cache', 'false');
                myfunctions.listHostedZones().then(data => {
                    res.send(data);
                    write_json_file("listHostedZones", JSON.stringify(data));
                }).catch(err => {
                    next(err);
                });
            } else {
                fs.readFile(myfunctions.getcache + 'listHostedZones.json', (err, data) => {
                    if (err) {
                        next(err);
                    } else {
                        res.header('custom-cache', 'true');
                        res.send(JSON.parse(data));
                    }
                });
            }
        }
    });
});
/*app.get('/listResourceRecordSets', (req, res, next) => {
    let HostedZoneId = req.query.zoneId;
    //console.log(HostedZoneId);
    myfunctions.listResourceRecordSets(HostedZoneId).then(data => {
        res.send(data);
    }).catch(err => {
        res.send("An error occurred retrieving information.");
    });
});*/

//so this api call is a serious mess
// basically causes a maximum of 10 loops on the same .then()
// by recreating the promise at the end of the .then()
// and then at the beginning of the next iteration it binds the .then() to the promise created at the end of the last .then()
// becuse of the async/await on the p.then() it forces the loop to wait until the .then() returns
// before trying to bind the next .then()
app.get('/listResourceRecordSets', (req, res, next) => {
    const response = { error: null, msg: "" };
    let input = {};
    //console.log(req.headers);
    input.token = req.headers.authtoken;
    auth.validateToken(input, (resp) => {
        if (resp.valid !== true) {
            res.send({ error: "Invalid Token." });
        } else {
            let HostedZoneId = req.query.zoneId;
            if (!HostedZoneId) {
                return new Promise((resolve, reject) => {
                    response.error = "No zone provided";
                    response.msg = "You must select a zone from the dropdown list next to to the \"Get Records\" button.";
                    resolve(response);
                })
            }
            let p = myfunctions.listResourceRecordSets(HostedZoneId);//Initial get of records
            let collection = { ResourceRecordSets: [] };//array of record sets only, to be sent back to requestor
            let retrieve = async (p) => {//async function to manage repeated .then()
                let x = 0;
                while (x < 10) {//upper bound of 1000 records
                    await p.then(resp => {//called recursively to continue getting records in sets of MaxItems
                        collection.ResourceRecordSets = collection.ResourceRecordSets.concat(resp.ResourceRecordSets);
                        //console.log("Length = " + collection.ResourceRecordSets.length);
                        if (resp.IsTruncated && x < 10) {//IsTruncated flag from AWS indicating more exist, trigger next call
                            //console.log("Getting next record. x= " + x);
                            x++;
                            //Get next set of records starting at NextRecordName
                            //recreate p, so next loop iteration runs p.then() on the new promise
                            p = myfunctions.listResourceRecordSets(HostedZoneId, resp.NextRecordName);
                        } else {
                            //console.log("Returning collection. x=" + x);
                            x = 99;//Hard Disable further execution
                            return collection;//accessible in next .then() function
                        }
                    }).catch(err => {
                        x = 99;
                        //console.log("Caught an error: " + err);
                    });
                }
                p.then(data => {
                    //console.log("Data length: " + collection.ResourceRecordSets.length);
                    //write_json_file("output", collection, './');
                    res.send(collection);
                });
            }
            retrieve(p);
        }
    });

});

app.get('/updateDNS', (req, res, next) => {
    let data = req.query.data;
    data = JSON.parse(data);
    if (typeof data != "object") {
        console.error("Error: expected an object. Received a: " + typeof data);
        res.send("Error: expected an object. Received a: " + typeof data);
    } else {
        let resp = myfunctions.changeResourceRecordSets(data);
        res.send(resp);
    }
    //console.log(data);
});

//start server
//listens on the port specified way at the top
//https only because I specialized in security in school
https.createServer(httpsOptions, app).listen(port, () => {
    console.log(`API server listening on ${port}`);
});
