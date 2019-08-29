var awsDNSApp = angular.module('awsdns', ['ngCookies']);
const $serverBaseURL = 'https://example.com';
const $serverPort = ':8080/';
const $serverURL = $serverBaseURL + $serverPort;
const $updatePasswordURL = $serverBaseURL + "/changemypassword/";

awsDNSApp.controller('auth', ['$scope', '$http', '$cookies', ($scope, $http, $cookies) => {
    $scope.username = "";
    $scope.password = "";
    authtoken = $cookies.getObject('authtoken');//get from browser
    username = $cookies.getObject('username');

    if (authtoken && authtoken != '') {
        $scope.$broadcast('authenticated');
        $scope.authstyle = { "display": "none" };
    } else {
        $scope.mainstyle = { "display": "none" };
    }

    $scope.resetPassword = function () {
        window.open($updatePasswordURL);
    }

    //console.log(username, authtoken);
    $scope.login = function () {
        let expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + 7);//cookies expire after 7 days
        $http({
            method: 'POST',
            url: $serverURL + 'auth',
            params: {
                username: $scope.username,
                password: $scope.password
            }
        }).then(resp => {
            $scope.autherrormsg = resp.status + "(" + resp.data.status + "): " + resp.data.msg;
            //put necessary items into browser cookie store
            $cookies.putObject('authtoken', resp.data.token, {
                'expires': expireDate
            });
            $cookies.putObject('username', $scope.username, {
                'expires': expireDate
            });
            //console.log($cookies.getObject('authtoken'),$cookies.getObject('username'));
        }).then(() => {
            $scope.$broadcast('authenticated');
            $scope.authstyle = { "display": "none" };
            $scope.mainstyle = {};
        });
    }
}]);

awsDNSApp.controller('resourceRecords', ['$scope', '$http', '$cookies', function ($scope, $http, $cookies) {
    $scope.records = [];
    let cookies = {};
    cookies.authtoken = $cookies.getObject('authtoken');
    cookies.username = $cookies.getObject('username');

    //cause load after login. 
    $scope.$on('authenticated', () => {
        //console.log("Broadcast received!");
        cookies.authtoken = $cookies.getObject('authtoken');
        cookies.username = $cookies.getObject('username');
    });

    $scope.getRecords = function () {
        //console.log($scope.zoneId);
        $http({
            method: 'GET',
            url: $serverURL + 'listResourceRecordSets',
            params: { zoneId: $scope.zoneId },
            headers: {
                authtoken: cookies.authtoken,
                user: cookies.username
            }
        }).then(response => {
            //console.log(response);
            if (typeof response != "object") {
                throw ('Did not receive an object from the server.');
            }
            let results = [];
            for (let i = 0; i < response.data.ResourceRecordSets.length; i++) {
                results[i] = response.data.ResourceRecordSets[i];
                if (results[i].AliasTarget) {
                    results[i].Target = results[i].AliasTarget.DNSName;
                } else if (results[i].ResourceRecords.length > 0) {
                    results[i].Target = "";
                    for (let j = 0; j < results[i].ResourceRecords.length; j++) {
                        if (results[i].ResourceRecords[j].Value) {
                            //console.log(results[i].ResourceRecords[j].Value);
                            results[i].Target += results[i].ResourceRecords[j].Value + " ";
                        }
                    }
                }
            }
            $scope.records = results;
        }).catch(response => {
            console.error("Error: " + JSON.stringify(response));
        });
    }
}]);

class entryrow {
    constructor(index = 0, name = '', target = '', sd = '', std = '') {
        this.index = index;
        this.name = name || "";
        this.target = target || "";
        this.selectedDomain = sd || null;
        this.selectedTargetDomain = std || null;
    }
}

awsDNSApp.controller('updatedns', ['$scope', '$http', '$cookies', function ($scope, $http, $cookies) {
    $scope.list = [];
    let hostedZones = [];
    $scope.rowcountindex = 1;

    let cookies = {};
    $scope.savedEntry = null;
    cookies.authtoken = $cookies.getObject('authtoken');
    cookies.username = $cookies.getObject('username');

    //cause load if cookies exist
    if (cookies.authtoken) {
        //console.log("Inside updateDNS:",cookies.authtoken);
        getZones(cookies);
    } else {
        $scope.rows = [new entryrow()];
    }

    //cause load after login. 
    $scope.$on('authenticated', () => {
        //console.log("Broadcast received!");
        cookies.authtoken = $cookies.getObject('authtoken');
        cookies.username = $cookies.getObject('username');
        getZones(cookies);
        $scope.rows = [new entryrow()];
    });

    function getZones(cookies) {
        //console.log(cookies);
        $http({
            method: 'GET',
            url: $serverURL + 'listHostedZones',
            headers: {
                authtoken: cookies.authtoken,
                user: cookies.username
            }
        }).then(function successCallback(response) {
            if (response.error) {
                $scope.errordata = response.error + ": " + response.msg;
            }

            response = response['data']['HostedZones'];
            for (let i = 0; i < response.length; i++) {
                //console.log(response[i]['Id'].replace(/\/hostedzone\/(.+)$/,'$1'));
                hostedZones.push({
                    Name: response[i]["Name"],
                    Id: response[i]['Id'].replace(/\/hostedzone\/(.+)$/, '$1'),
                    i: i
                });
            }
            $scope.zones = hostedZones;
            $scope.zoneId = hostedZones[0]["Id"];
            $scope.rows = [new entryrow(0, "", "", hostedZones[0]["Id"], hostedZones[0]["Id"])];
            //console.log(hostedZones);
        }, function errorCallback(response) {
            console.error("Error: ", response);
        });
    }

    $scope.importdata = function () {
        $scope.tableregion = { display: "none" };
        $scope.importdatastyle = { display: "" };
    }

    function rfi() {//returnFromImport = swap visible
        $scope.tableregion = { display: "" };
        $scope.importdatastyle = { display: "none" };
    } $scope.returnFromImport = rfi;

    function getObjectParamsFromArray(knownKey, x, unknownKey, arr) {
        for (i in arr) {
            if (arr[i][knownKey].match(x)) {
                return arr[i][unknownKey];
            }
        }
        return;
    }

    $scope.CascadeTarget = function () {
        let entry0 = $scope.rows[0];
        for (let i = 1; i < $scope.rows.length; i++) {
            if ($scope.rows[i].target !== "") {
                continue;
            } else {
                $scope.rows[i].target = $scope.rows[0].target;
                $scope.rows[i].selectedTargetDomain = $scope.rows[0].selectedTargetDomain;
            }
        }
    }

    $scope.submitImportData = function () {
        if ($scope.importDataContents === undefined || $scope.importDataContents === "") {
            rfi();
        } else {
            let importErrors = [];
            $scope.rows = [];
            let tempIndex = 0;
            $scope.importDataContents.split("\n").forEach(i => {
                if (!i) {
                    return
                }
                let m = i.match(/([^\.]+)\.?(.+)?/);//m[1]==hostname && m[2]==domain
                //console.log('['+m[0]+']','['+m[1]+']','['+m[2]+']');
                if (m) {
                    let zone = getObjectParamsFromArray("Name", m[2], "Id", hostedZones);
                    if (zone) {
                        $scope.rows.push(
                            new entryrow(tempIndex, m[1], "", zone, null)
                        );
                        tempIndex++;
                    } else {
                        importErrors.push({ "ImportData": i, "Msg": "No Associated Zone" });
                    }
                } else {
                    importErrors.push({ "ImportData": i, "Msg": "Could not parse" });
                }
            });
            $scope.rowcountindex = tempIndex;
            rfi();
            if (importErrors.length > 0) {
                let errmsg = "";
                for (let i in importErrors) {
                    console.log(importErrors[i]);
                    errmsg += JSON.stringify(importErrors[i]) + "\n";
                }
                alert("Error importing some entries:\n" + errmsg);
            }
        }
    }

    function addRowFunction() {
        if ($scope.savedEntry != null) {
            $scope.savedEntry = $scope.rows[$scope.rows.length - 1];
            $scope.rows.push(
                new entryrow($scope.rowcountindex, $scope.savedEntry.name, $scope.savedEntry.target, $scope.savedEntry.selectedDomain, $scope.savedEntry.selectedTargetDomain)
            );
        } else {
            $scope.savedEntry = $scope.rows[$scope.rows.length - 1];
            $scope.rows.push(
                new entryrow($scope.rowcountindex, $scope.savedEntry.name, $scope.savedEntry.target, $scope.savedEntry.selectedDomain, $scope.savedEntry.selectedTargetDomain)
            );
        }
        $scope.rowcountindex++;
        console.log($scope.rows);
    } $scope.addrow = addRowFunction;

    $scope.removerow = function () {
        if ($scope.rowcountindex == 1) {
            return;
        }
        $scope.rowcountindex--;
        $scope.rows.pop();
        //$scope.savedEntry = $scope.rows.pop();
    }

    $scope.addTarget = function (word) {

    }

    $scope.removeTarget = function () {

    }

    $scope.updateRecords = function () {
        let params = [];
        let table = document.getElementById("updateTable");
        try {
            for (let i = 0; i < table.rows.length - 1; i++) {
                let domainBox = document.getElementById('c' + 1 + 'r' + i);
                let targetDomainBox = document.getElementById('c' + 3 + 'r' + i);
                params.push({});
                console.log('c' + 0 + 'r' + i);
                params[i]["name"] = document.getElementById('c' + 0 + 'r' + i).value;
                params[i]["targetName"] = document.getElementById('c' + 2 + 'r' + i).value;
                if (!params[i]["name"] || !params[i]["targetName"]) {
                    alert("Please fill out all fields before submitting!");
                    return;
                }
                params[i]["name"] += "." + domainBox.options[domainBox.selectedIndex].text;
                params[i]["zoneId"] = domainBox.value;
                if (targetDomainBox.value == "ipaddr") {
                    params[i]["targetZoneId"] = params[i]["zoneId"];
                } else {
                    params[i]["targetZoneId"] = targetDomainBox.value;
                    params[i]["targetName"] += "." + targetDomainBox.options[targetDomainBox.selectedIndex].text;
                }
                //let targetDomainName = params[i-1]["targetName"].replace(/^[0-9A-Za-z\-]+\.([0-9A-Za-z\-\.]+)$/,"$1");
            }
        } catch (e) {
            alert ("Error: "+e);
        }
        let c = confirm("Submit changes?");
        if (c == false) {
            return;
        }
        //console.log("Params type = " + typeof params, params);
        $http({
            method: 'GET',
            url: $serverURL + 'updateDNS',
            params: { data: [params] },
            headers: {
                authtoken: cookies.authtoken,
                user: cookies.username
            }
        }).then(response => {
            if (response.error) {
                $scope.updatednserrormsg = response.error + ": " + response.msg;
            } else {
                console.log(response);
            }
        }).catch(err => {
            console.error(err);
        });
    }
}]);
