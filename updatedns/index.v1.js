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
    constructor(index = 1, name = '', target = '', sd = '', std = '') {
        this.name = name || "";
        this.target = target || "";
        this.selectedDomain = sd || null;
        this.selectedTargetDomain = std || null;
        this.index = index;
    }
}

awsDNSApp.controller('updatedns', ['$scope', '$http', '$cookies', function ($scope, $http, $cookies) {
    $scope.list = [];
    let hostedZones = [];
    $scope.rowcountindex = 1;
    $scope.rows = [new entryrow()];
    let cookies = {};
    $scope.savedEntry = null;
    cookies.authtoken = $cookies.getObject('authtoken');
    cookies.username = $cookies.getObject('username');

    //cause load if cookies exist
    if (cookies.authtoken) {
        //console.log("Inside updateDNS:",cookies.authtoken);
        getZones(cookies);
    }

    //cause load after login. 
    $scope.$on('authenticated', () => {
        //console.log("Broadcast received!");
        cookies.authtoken = $cookies.getObject('authtoken');
        cookies.username = $cookies.getObject('username');
        getZones(cookies);
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
            //console.log(hostedZones);
        }, function errorCallback(response) {
            console.error("Error: ", response);
        });
    }

    $scope.addrow = function () {
        $scope.rowcountindex++;
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
    }

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

    for (let i = 1; i < table.rows.length; i++) {
        let domainBox = document.getElementById('c' + 1 + 'r' + i);
        let targetDomainBox = document.getElementById('c' + 3 + 'r' + i);
        params.push({});
        params[i - 1]["name"] = document.getElementById('c' + 0 + 'r' + i).value;
        params[i - 1]["targetName"] = document.getElementById('c' + 2 + 'r' + i).value;
        if (!params[i - 1]["name"] || !params[i - 1]["targetName"]) {
            alert("Please fill out all fields before submitting!");
            return;
        }
        params[i - 1]["name"] += "." + domainBox.options[domainBox.selectedIndex].text;
        params[i - 1]["zoneId"] = domainBox.value;
        if (targetDomainBox.value == "ipaddr") {
            params[i - 1]["targetZoneId"] = params[i - 1]["zoneId"];
        } else {
            params[i - 1]["targetZoneId"] = targetDomainBox.value;
            params[i - 1]["targetName"] += "." + targetDomainBox.options[targetDomainBox.selectedIndex].text;
        }
        //let targetDomainName = params[i-1]["targetName"].replace(/^[0-9A-Za-z\-]+\.([0-9A-Za-z\-\.]+)$/,"$1");
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
