var awsDNSApp = angular.module('passwordupdate', []);
const $serverURL = 'https://example/com:8080/';

awsDNSApp.controller('base', ['$scope', '$http', ($scope, $http) => {
    $scope.username = "";
    $scope.currentpassword = "";
    $scope.newpassword = "";
    $scope.confirmpassword = "";

    $scope.Update = function () {
        if ($scope.newpassword !== $scope.confirmpassword) {
            $scope.autherrormsg = "Passwords do not match.";
        } else if ($scope.newpassword.length < 8) {
            $scope.autherrormsg = "Password must be at least 8 characters.";
        } else {
            $http({
                method: 'POST',
                url: $serverURL + 'updatePassword',
                params: {
                    username: $scope.username,
                    currentpassword: $scope.currentpassword,
                    newpassword: $scope.newpassword
                }
            }).then(resp => {
                $scope.autherrormsg = resp.status + "(" + resp.data.status + "): " + resp.data.msg;
            });
        }
    }
}]);
