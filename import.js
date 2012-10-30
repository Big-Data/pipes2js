
var fs = require('fs'),
    request = require('request');


if (process.argv.length < 3) {
    throw "Please provide a pipeId !";
}
var pipeId = process.argv[2];


var fetchPipe = function (pipeId, cb) {
    request('http://pipes.yahoo.com/pipes/pipe.info?_id=' + pipeId + '&_out=json&format=json', function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var pipe = JSON.parse(JSON.parse(body).PIPE.working);
            cb(pipe);
        }
    });
};

/**
 * Get the Yahoo! Pipes JSON definition
 */

fetchPipe(pipeId, function (pipe) {

    //console.log(JSON.stringify(pipe, null, 3));

    /**
     * Build a structure representing the modules (activities) and input and output wires
     */
    var modules = pipe.modules;

    var modulesById = {},
        embeddedModulesById = {};
    modules.forEach(function (m) {
        // Index modules by Id
        modulesById[m.id] = m;

        // initialize wires list
        m.inputWires = [];
        m.outputWires = [];

        if (m.type === "loop") {
            var submodule = m.conf.embed.value;
            embeddedModulesById[submodule.id] = submodule;
            submodule.parentModuleId = m.id;
        }

    });

    var wires = pipe.wires;
    wires.forEach(function (w) {
        modulesById[w.src.moduleid].outputWires.push(w);

        if (modulesById[w.tgt.moduleid]) {
            modulesById[w.tgt.moduleid].inputWires.push(w);
        } else if (embeddedModulesById[w.tgt.moduleid]) {
            modulesById[embeddedModulesById[w.tgt.moduleid].parentModuleId].inputWires.push(w);
        }
    });


    /**
     * Generate decider code
     */

    var deciderCode = [];

    deciderCode.push("/*globals just_started,schedule,scheduled,completed,workflow_input,stop,results,waiting_for */");

    // Modules to run whren just_started = modules with no input wire
    deciderCode.push("if (just_started) {");
    modules.filter(function (m) {
        if (m.inputWires.length === 0) {

            var params = {
                activityType: m.type,
                input: m.conf
            };

            deciderCode.push("    schedule(" + JSON.stringify(m.id) + ", " + JSON.stringify(params, null, 4).replace(/\n/g, '\n    ') + ");");
        }
    });
    deciderCode.push("}");



    // For Each module with inputs
    modules.filter(function (m) {
        if (m.inputWires.length > 0) {

            var conditionLine = "if (!scheduled(" + JSON.stringify(m.id) + ")";

            // For each incoming module :
            var incomingValues = {};
            m.inputWires.map(function (w) {
                var m = modulesById[w.src.moduleid];
                conditionLine += " && completed(" + JSON.stringify(m.id) + ")";

                // prepare the incomingValues structure
                incomingValues[w.tgt.id] = w.src;
            });

            conditionLine += ") {";
            deciderCode.push(conditionLine);

            var params = {
                activityType: m.type,
                input: m.conf
            };

            deciderCode.push("    var params = " + JSON.stringify(params, null, 4).replace(/\n/g, '\n    ') + ";");

            // Add the incomingValues
            var k;
            for (k in incomingValues) {
                if (incomingValues.hasOwnProperty(k)) {
                    var src = incomingValues[k];
                    deciderCode.push("    params.input[" + JSON.stringify(k) + "] = results(" + JSON.stringify(src.moduleid) + ")." + src.id + ";");
                }
            }

            deciderCode.push("    schedule(" + JSON.stringify(m.id) + ", params);");

            deciderCode.push("}");


            // TODO
            /*if (m.inputWires.length > 1) {
                deciderCode.push("if ( (scheduled('sw-61') && !completed('sw-61')) || (scheduled('sw-228') && !completed('sw-228')) || (scheduled('sw-232') && !completed('sw-232')) ) {");
                deciderCode.push("    waiting_for('sw-61', 'sw-228', 'sw-232');"); // TODO: fix in aws-swf, if decisions, dont override this.decisions = [];
                deciderCode.push("}");
            }*/

        }
    });

    // Stop = module _OUTPUT completed
    deciderCode.push("if (completed('_OUTPUT')) {");
    deciderCode.push("    stop('finished !');");
    deciderCode.push("}");


    try {
        fs.mkdirSync('pipes/' + pipeId);
    } catch (ex) {}

    fs.writeFileSync('pipes/' + pipeId + '/package.json', JSON.stringify({
        "name" : pipeId,
        "main" : "./" + pipeId + ".js"
    }, null, 3));

    fs.writeFileSync('pipes/' + pipeId + '/' + pipeId + '.js', deciderCode.join('\n'));


});