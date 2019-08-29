let service = require('node-windows').Service;
let path = require('path');
let os = require('os');
let paramscriptnumber = 4;
let action = "";

if (process.argv.length >= 4 &&  (process.argv[2] === "uninstall" || process.argv[2] === "u")) {
    console.log("Attempting Uninstall...");
    action = "uninstall";
} else if (process.argv.length >= 4 && (process.argv[2] === "install" || process.argv[2] === "i")) {
    console.log("Attempting Install...");
    action = "install";
} else {
    console.log("Run as: " + process.argv[1] + " <install|uninstall> ServiceDisplayName C:\\path\\to\\script \'Optional description\'");
    process.exit(1);
}

let name = process.argv[3];
let desc = process.argv[5] || process.argv[3] || "Placeholder description";
let script;
if (path.isAbsolute(process.argv[paramscriptnumber])) {
    script = process.argv[paramscriptnumber];
} else {
    script = path.join(__dirname, process.argv[paramscriptnumber]) || "";
}

let svc = new service({
    name: name,
    description: desc,
    script: script
});
svc.user.domain = os.hostname() || 'localhost';
svc.user.account = os.userInfo().username || 'Administrator';

console.log("Service Display name    = " + name);
console.log("Service Description     = " + desc);
console.log("Script location         = " + script);
console.log("Windows Domain          = " + svc.user.domain);
console.log("Windows User            = " + svc.user.account);
console.log();

try {
    svc.user.password = process.argv[5];
} catch (err) {
    console.log("An error occurred", err);
    process.exit(1);
}

if (action === 'install') {
    svc.on('install', () => {
        svc.start();
        console.log("Successfully created server: " + name);
    });

    svc.install();
}
else if (action === 'uninstall') {
    svc.on('uninstall', () => {
        console.log('Uninstall complete.');
        console.log('Checking if the service exists (should be false)... ', svc.exists);
    });

    svc.uninstall();
} else {
    console.log("Unknown options specified.");
    console.log("Run as: " + process.argv[1] + " <install|uninstall> C:\\path\\to\\script");
}
