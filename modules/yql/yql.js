
var request = require('request'),
    querystring = require('querystring');

var valueFor = function (val, input) {
    var value;
    if (typeof val === "string") {
        value = val;
    } else if (val.hasOwnProperty("value")) {
        value = val.value;
    } else if (val.hasOwnProperty("terminal")) {
        value = input[val.terminal];
    }
    return value;
};


exports.worker = function (task, config) {

    var input = JSON.parse(task.config.input);

    var q = {
        q: valueFor(input.yqlquery, input),
        format: "json",
        diagnostics: (input.raw.value === "results") ? "false" : "true",
        callback: "",
        env: valueFor(input.envURL, input)
    };

    var url = "http://query.yahooapis.com/v1/public/yql?" + querystring.stringify(q);

    request(url, function (error, response, body) {

        console.log("Got response. Code = " + response.statusCode);

        if (!error && response.statusCode === 200) {

            task.respondCompleted({
                _OUTPUT: JSON.parse(body)
            });

        }
    });


};

