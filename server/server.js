const http = require('http');
const https = require('https');
const fs = require('fs');
const net = require('net');
const tls = require('tls');
const multer = require('multer');
const express = require('express');
const Moment = require('moment');
const async = require('async');
const superagent = require('superagent');
const bodyParser = require('body-parser');
const { forOwn } = require('lodash');
const { parse } = require('path');
const { exec } = require('child_process');

const bootstrap = {
    status: 1
};
const functions = {
    name: []
};
let total_nodes = 0;
let config;
let config_file;
if (process.env.PICLUSTER_CONFIG) {
    config = JSON.parse(fs.readFileSync(process.env.PICLUSTER_CONFIG, 'utf8'));
    config_file = process.env.PICLUSTER_CONFIG;
} else {
    config = JSON.parse(fs.readFileSync('../config.json', 'utf8'));
    config_file = '../config.json';
}

if (config.ssl_self_signed) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const app = express();
app.use(bodyParser.json());

const upload = multer({
    dest: '../'
});
const scheme = config.ssl ? 'https://' : 'http://';
const ssl_self_signed = config.ssl_self_signed === false;
const server = config.web_connect;
let {
    rsyslog_host
} = config;
const {
    server_port
} = config;
const {
    agent_port
} = config;
let log = '';
let {
    token
} = config;
let dockerFolder = config.docker;
const container_faillog = [];
const picluster_release = '2.6';

if (config.loadbalancer) {
    configure_loadbalancer();
}

if (config.elasticsearch) {
    const mapping = {
        settings: {
            index: {
                number_of_shards: 3,
                number_of_replicas: 2
            }
        },
        mappings: {
            'picluster-logging': {
                properties: {
                    date: {
                        type: 'date',
                        index: 'true',
                    },
                    data: {
                        type: 'keyword',
                        index: 'true'
                    }
                }
            }
        }
    };

    const monitoring_mapping = {
        settings: {
            index: {
                number_of_shards: 3,
                number_of_replicas: 2
            }
        },
        mappings: {
            'picluster-monitoring': {
                properties: {
                    date: {
                        type: 'date',
                        index: 'true'
                    },
                    cpu: {
                        type: 'double',
                        index: 'true'
                    },
                    node: {
                        type: 'text',
                        index: 'true'
                    },
                    memory: {
                        type: 'double',
                        index: 'true'
                    },
                    network_tx: {
                        type: 'double',
                        index: 'true'
                    },
                    network_rx: {
                        type: 'double',
                        index: 'true'
                    },
                    disk: {
                        type: 'double',
                        index: 'true'
                    },
                    total_running_containers: {
                        type: 'double',
                        index: 'true'
                    }
                }
            }
        }
    };

    create_es_mappings(mapping, 'picluster-logging');
    create_es_mappings(monitoring_mapping, 'picluster-monitoring');
}

//templates
/** 
superagent
.get(`${scheme}${node}:${agent_port}/node-status`)
.query({ token: token })
.end((error, response) => {
});

  superagent
            .post(`${scheme}${server}:${server_port}/updateconfig`)
            .send({ token: token, payload })
            .set('accept', 'json')
            .end((error, response) => {
            });

*/
function create_es_mappings(mapping, index) {
    superagent
        .put(config.elasticsearch + '/' + index)
        .send(mapping)
        .set('accept', 'json')
        .end((error, response) => {
            console.log('\nCreating Elasticsearch Map......');
            if (error) {
                console.log(error);
            } else {
                console.log(response.text);
            }
        });
}

if (config.automatic_heartbeat) {
    if (config.automatic_heartbeat.indexOf('enabled') > -1) {
        if (config.heartbeat_interval) {
            console.log('\nAutomatic Heartbeat Enabled. Will check every: ' + config.heartbeat_interval + ' ms.');
            automatic_heartbeat();
        } else {
            console.log('\nAutomatic Heartbeat Disabled: heartbeat_interval is not set.');
        }
    } else {
        console.log('\nAutomatic Heartbeat Disabled.');
    }
} else {
    console.log('\nAutomatic Heartbeat Disabled.');
}

function automatic_heartbeat() {
    if (config.automatic_heartbeat.indexOf('enabled') > -1) {
        setTimeout(() => {
            superagent
                .get(`${scheme}${server}:${server_port}/hb`)
                .query({ token: token })
                .end((error, response) => {
                    if (error) {
                        console.log(error);
                    }
                });
            automatic_heartbeat();
        }, config.heartbeat_interval);
    } else {
        console.log('\nAutomatic Heartbeat Disabled.');
    }
}

app.get('/clear-functions', (req, res) => {
    const check_token = req.query.token;
    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        Object.keys(functions.name).forEach((get_name, i) => {
            delete_function(functions.name[i].name, functions.name[i].host);
            remove_function_data(functions.name[i].uuid);
        });
        res.end('Sent request to remove stale functions.');
    }
});

app.post('/bootstrap', (req, res) => {
    const check_token = req.body.token;
    const {
        host
    } = req.body;
    let statusCode = 0;
    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials or missing parameters.');
    } else {
        if (bootstrap.status === 1) {
            let proceed = 1;

            Object.keys(config.layout).forEach((get_node, i) => {
                if (config.layout[i].node.indexOf(host) > -1) {
                    proceed = 0;
                }
            });

            if (proceed) {
                config.layout.push({
                    node: host
                });

                config.hb.push({
                    node: host
                });

                superagent
                    .post(`${scheme}${server}:${server_port}/updateconfig`)
                    .send({
                        token,
                        payload: JSON.stringify(config)
                    })
                    .set('accept', 'json')
                    .end((error, response) => {
                        if (error) {
                            res.end('An error occurred: ' + error);
                        } else {
                            bootstrap.status = 1;
                            console.log('\nAdded node: ' + host + ' to the cluster.');
                            statusCode = 1;
                        }
                    });
            } else {
                bootstrap.status = 1;
                console.log('\nnode: ' + host + ' is already part of the cluster.');
                statusCode = 2;
            }
        } else {
            console.log('\nAnother bootstrap process is already running. Please try again later.');
            statusCode = 0;
        }
        res.end(JSON.stringify({
            output: statusCode
        }));
    }
});

app.post('/function', (req, res) => {
    const check_token = req.body.token;
    const {
        output
    } = req.body;
    const {
        uuid
    } = req.body;

    if ((check_token !== token) || (!check_token) || (!uuid)) {
        res.end('\nError: Invalid Credentials or missing parameters.');
    } else {
        Object.keys(functions.name).forEach((get_name, i) => {
            if (functions.name[i].uuid.toString().indexOf(uuid.toString()) > -1) {
                functions.name[i].output = output;
                delete_function(functions.name[i].name, functions.name[i].host);
                res.end('');
            }
        });
    }
});

app.get('/function', (req, res) => {
    const check_token = req.query.token;
    const name = req.query.function;
    const min = 1;
    const max = 9999999;
    const uuid = Math.floor(Math.random() * (max - min + 1)) + min;
    const min_node = 0;
    const max_node = total_nodes - 1;
    const node_number = Math.floor(Math.random() * (max_node - min_node + 1)) + min_node;
    const host = config.layout[node_number].node;
    const {
        container_args
    } = req.query;

    const function_data = {
        uuid,
        name: name + '-' + uuid,
        output: '',
        host
    };

    if ((check_token !== token) || (!check_token) || (!name)) {
        res.end('\nError: Invalid Credentials or parameters.');
    } else {
        functions.name.push(function_data);
        create_function(name + '-' + uuid, uuid, host, container_args);
        res.end(scheme + server + ':' + server_port + '/getfunction?token=' + token + '&uuid=' + uuid);
    }
});

function remove_function_data(uuid) {
    Object.keys(functions.name).forEach((get_name, i) => {
        if (functions.name[i].uuid.toString().indexOf(uuid.toString()) > -1) {
            functions.name[i].name = '';
            functions.name[i].output = '';
            functions.name[i].uuid = '';
            functions.name[i].host = '';
        }
    });
}

app.get('/getfunction', (req, res) => {
    const check_token = req.query.token;
    const {
        uuid
    } = req.query;
    let output = '';

    if ((check_token !== token) || (!check_token) || (!uuid)) {
        res.end('\nError: Invalid Credentials or parameters.');
    } else {
        Object.keys(functions.name).forEach((get_name, i) => {
            if ((functions.name[i].uuid.toString().indexOf(uuid.toString()) > -1 && functions.name[i].output.length > 1)) {
                output = functions.name[i].output;
                remove_function_data(uuid);
            }
        });
        res.end(output);
    }
});

function create_function(name, uuid, host, user_container_args) {
    let container_args = '-e UUID=' + uuid + ' -e TOKEN=' + token + ' -e SERVER=' + scheme + server + ':' + server_port;
    const container = name;

    if (user_container_args) {
        container_args = user_container_args + ' ' + container_args;
    }

    migrate(container, host, host, container_args, uuid);
}

app.get('/clearlog', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        log = '';
        res.end();
    }
});

app.get('/nodes', (req, res) => {
    const node_metrics = {
        data: [],
        functions,
        function_server: `${scheme}${server}:${server_port}/getfunction`
    };

    function addData(data) {
        node_metrics.data.push(data);
    }

    function getData() {
        let total_node_count = 0;
        let total_containers = 0;
        const node_list = [];
        const container_list = [];

        for (let i = 0; i < config.layout.length; i++) {
            for (const key in config.layout[i]) {
                if (config.layout[i].hasOwnProperty(key)) {
                    const {
                        node
                    } = config.layout[i];
                    const node_info = config.layout[i][key];
                    if (node_info === node) {
                        total_node_count++;
                        node_list.push(node);
                    } else {
                        total_containers++;
                        container_list.push(key);
                    }
                }
            }
        }

        node_metrics.total_containers = total_containers;
        node_metrics.total_nodes = total_node_count;
        node_metrics.container_list = container_list;
        node_metrics.nodes = node_list;
        total_nodes = total_node_count;
        return node_metrics;
    }

    const check_token = req.query.token;
    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        config.layout.forEach(get_node => {
            const {
                node
            } = get_node;

            if (!node) {
                console.error('Invalid Config for node', get_node);
                return;
            }

            superagent
                .get(`${scheme}${node}:${agent_port}/node-status`)
                .query({ token: token })
                .end((error, response) => {
                    if (error) {
                        console.error(error);
                    } else {
                        try {
                            const check = JSON.parse(response.text);
                            if (check.cpu_percent > 0) {
                                addData(check);
                                if (config.elasticsearch) {
                                    elasticsearch_monitoring(check.cpu_percent / check.cpu_cores, check.hostname, check.disk_percentage, check.memory_percentage, check.total_running_containers, check.network_rx, check.network_tx);
                                }
                            }
                        } catch (error2) {
                            console.log('\nError gathering monitoring metrics: Invalid JSON or Credentials!' + error2);
                        }
                    }
                });
        });
        setTimeout(() => {
            res.json(getData());
        }, 3000);
    }
});

function addLog(data) {
    log += data;
}

app.get('/', (req, res) => {
    res.end('PiCluster Server v' + picluster_release);
});

app.get('/manage-image', (req, res) => {
    const check_token = req.query.token;
    const {
        operation
    } = req.query;
    let docker_command = '';
    let container = '';
    let command_log = '';
    const url = [];
    const what = [];
    const {
        no_cache
    } = req.query;

    if (req.query.container) {
        container = req.query.container;
    }

    if (container.indexOf('*') > -1 || container.length === 0) {
        container = '*';
    }

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        Object.keys(config.layout).forEach((get_node, i) => {
            Object.keys(config.layout[i]).forEach(key => {
                const {
                    node
                } = config.layout[i];

                if ((!config.layout[i].hasOwnProperty(key) || key.indexOf('node') > -1)) {
                    return;
                }
                const make_url = `${scheme}${node}:${agent_port}/run`;
                if (container.indexOf('*') > -1 || container.indexOf(key) > -1) {
                    what.push(key);
                    url.push(make_url);
                }
            });
        });

        let i = 0;

        async.eachSeries(url, (url, cb) => {
            if (operation === 'rm') {
                docker_command = 'docker image rm ' + what[i];
            }

            if (operation === 'build' && no_cache === '1') {
                docker_command = 'docker image build --no-cache ' + dockerFolder + '/' + what[i] + ' -t ' + what[i] + ' -f ' + dockerFolder + '/' + what[i] + '/Dockerfile';
            }

            if (operation === 'build' && no_cache === '0') {
                docker_command = 'docker image build ' + dockerFolder + '/' + what[i] + ' -t ' + what[i] + ' -f ' + dockerFolder + '/' + what[i] + '/Dockerfile';
            }

            superagent
                .post(url)
                .send({ token: token, command: docker_command })
                .set('accept', 'json')
                .end((error, response) => {
                    try {
                        const data = JSON.parse(response.text);
                        command_log += 'Node: ' + data.node + '\n\n' + data.output + '\n\n';
                        cb(error);
                    } catch (error) {
                        console.log(error);
                    }
                });
            i++;
        }, err => {
            if (err) {
                console.log('\nError: ' + err);
            }
            res.end(command_log);
        });
    }
});

app.get('/manage', (req, res) => {
    const check_token = req.query.token;
    const {
        operation
    } = req.query;
    let docker_command = '';
    let command_log = '';
    let container = '';
    const url = [];
    const what = [];
    const args = [];

    if (operation === 'start') {
        docker_command = 'docker container start';
    }
    if (operation === 'stop') {
        docker_command = 'docker container stop';
    }
    if (operation === 'rm') {
        docker_command = 'docker container rm -f';
    }
    if (operation === 'restart') {
        docker_command = 'docker container restart';
    }
    if (operation === 'logs') {
        docker_command = 'docker container logs';
    }
    if (operation === 'create') {
        docker_command = 'docker container run -d --name ';
    }

    if (req.query.container) {
        container = req.query.container;
    }

    if (container.indexOf('*') > -1 || container.length === 0) {
        container = '*';
    }

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        Object.keys(config.layout).forEach((get_node, i) => {
            Object.keys(config.layout[i]).forEach(key => {
                const {
                    node
                } = config.layout[i];

                if ((!config.layout[i].hasOwnProperty(key) || key.indexOf('node') > -1)) {
                    return;
                }
                const make_url = `${scheme}${node}:${agent_port}/run`;
                if (container.indexOf('*') > -1 || container.indexOf(key) > -1) {
                    what.push(key);
                    url.push(make_url);
                    args.push(config.layout[i][key]);
                }
            });
        });

        let i = 0;

        async.eachSeries(url, (url, cb) => {
            let command;
            if (operation === 'create') {
                command = docker_command + what[i] + ' ' + args[i] + ' ' + what[i];
            } else {
                command = docker_command + ' ' + what[i];
            }

            superagent
                .post(url)
                .send({ token: token, command: command })
                .set('accept', 'json')
                .end((error, response) => {
                    try {
                        const data = JSON.parse(response.text);
                        command_log += 'Node: ' + data.node + '\n\n' + data.output + '\n\n';
                        cb(error);
                    } catch (error) {
                        console.log(error);
                    }
                });
            i++;
        }, err => {
            if (err) {
                console.log('\nError: ' + err);
            }
            res.end(command_log);
        });
    }
});

function migrate(container, original_host, new_host, original_container_data, uuid) {
    let existing_automatic_heartbeat_value = '';

    if (config.automatic_heartbeat) {
        existing_automatic_heartbeat_value = config.automatic_heartbeat;
        if (config.automatic_heartbeat.indexOf('enabled') > -1) {
            config.automatic_heartbeat = 'disabled';
        }
    }

    superagent
        .post(`${scheme}${original_host}:${agent_port}/run`)
        .send({ token: token, command: 'docker container rm -f ' + container })
        .set('accept', 'json')
        .end((error, response) => {
            if (error) {
                addLog('An error has occurred.');
            } else {
                let command = '';
                if (uuid) {
                    const image_name = container.split('-' + uuid)[0];
                    command = 'docker image build ' + dockerFolder + '/' + image_name + ' -t ' + image_name + ' -f ' + dockerFolder + '/' + image_name + '/Dockerfile;docker container run -d --name ' + container + ' ' + original_container_data + ' ' + image_name;
                } else {
                    command = 'docker image build ' + dockerFolder + '/' + container + ' -t ' + container + ' -f ' + dockerFolder + '/' + container + '/Dockerfile;docker container run -d --name ' + container + ' ' + original_container_data + ' ' + container;
                }

                superagent
                    .post(`${scheme}${new_host}:${agent_port}/run`)
                    .send({ token: token, command: command })
                    .set('accept', 'json')
                    .end((second_error, second_response) => {
                        if (second_error) {
                            addLog('An error has occurred.');
                        }
                        if (config.automatic_heartbeat) {
                            if (existing_automatic_heartbeat_value.indexOf('enabled') > -1) {
                                config.automatic_heartbeat = existing_automatic_heartbeat_value;
                            }
                        }
                    });
            }
        });
}

app.get('/addhost', (req, res) => {
    const check_token = req.query.token;
    const {
        host
    } = req.query;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        let proceed = 1;
        for (let i = 0; i < config.layout.length; i++) {
            if (config.layout[i].node.indexOf(host) > -1) {
                proceed = 0;
            }
        }

        if (proceed) {
            config.layout.push({
                node: host
            });

            config.hb.push({
                node: host
            });

            superagent
                .post(`${scheme}${server}:${server_port}/updateconfig`)
                .send({ token: token, payload: JSON.stringify(config) })
                .set('accept', 'json')
                .end((error, response) => {
                    if (error) {
                        res.end(error);
                    } else {
                        res.end('\nAdded host ' + host + ' to the configuration.');
                    }
                });
        } else {
            res.end('\nError: Host already exists');
        }
    }
});

function elasticsearch_monitoring(cpu, node, disk, memory, total_running_containers, network_rx, network_tx) {
    const current_time = new Moment();

    superagent
        .post(config.elasticsearch + '/picluster-monitoring/picluster-monitoring')
        .send({
            date: current_time,
            cpu,
            node,
            disk,
            memory,
            network_rx,
            network_tx,
            total_running_containers
        })
        .set('accept', 'json')
        .end((error, response) => {
            if (error) {
                console.log(error);
            }
        });
}

function elasticsearch(data) {
    const current_time = new Moment();

    superagent
        .post(config.elasticsearch + '/picluster-logging/picluster-logging')
        .send({
            date: current_time,
            data
        })
        .set('accept', 'json')
        .end((error, response) => {
            if (error) {
                console.log(error);
            }
        });
}

app.get('/rmhost', (req, res) => {
    const check_token = req.query.token;
    const {
        host
    } = req.query;
    let hb_proceed = 0;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        // Ensures that the host exists
        for (let i = 0; i < config.layout.length; i++) {
            if (config.layout[i].node.indexOf(host) > -1) {
                config.layout.splice(i, 1);
                hb_proceed = 1;
                break;
            }
        }
    }

    if (hb_proceed) {
        if (config.hb) {
            for (let i = 0; i < config.hb.length; i++) {
                if (config.hb[i].node.indexOf(host) > -1) {
                    config.hb.splice(i, 1);
                    break;
                }
            }
        }
    }

    superagent
        .post(`${scheme}${server}:${server_port}/updateconfig`)
        .send({ token, payload: JSON.stringify(config) })
        .set('accept', 'json')
        .end((error, response) => {
            if (error) {
                res.end(error);
            } else {
                res.end('\nRemoved host ' + host + ' from the configuration.');
            }
        });
});

app.get('/removecontainerconfig', (req, res) => {
    const check_token = req.query.token;
    const {
        container
    } = req.query;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        Object.keys(config.layout).forEach((get_node, i) => {
            Object.keys(config.layout[i]).forEach(key => {
                if ((!config.layout[i].hasOwnProperty(key) || key.indexOf('node') > -1)) {
                    return;
                }
                if (key.indexOf(container) > -1) {
                    delete config.layout[i][key];
                }
            });
        });

        if (config.hb) {
            Object.keys(config.hb).forEach((get_node, i) => {
                Object.keys(config.hb[i]).forEach(key => {
                    if ((!config.hb[i].hasOwnProperty(key) || key.indexOf('node') > -1)) {
                        return;
                    }
                    if (key.indexOf(container) > -1) {
                        delete config.hb[i][key];
                    }
                });
            });
        }

        if (config.container_host_constraints) {
            Object.keys(config.container_host_constraints).forEach((get_node, i) => {
                Object.keys(config.container_host_constraints[i]).forEach(key => {
                    const analyze = config.container_host_constraints[i][key].split(',');
                    if (container.indexOf(analyze[0]) > -1) {
                        config.container_host_constraints.splice(i, i + 1);
                    }
                });
            });

            for (let i = 0; i < config.container_host_constraints.length; i++) {
                for (const key in config.container_host_constraints[i]) {
                    if (container.length > 0) {
                        const analyze = config.container_host_constraints[i][key].split(',');
                        if (container.indexOf(analyze[0]) > -1) {
                            config.container_host_constraints.splice(i, i + 1);
                        }
                    }
                }
            }
        }

        superagent
            .post(`${scheme}${server}:${server_port}/updateconfig`)
            .send({ token: token, payload: JSON.stringify(config) })
            .set('accept', 'json')
            .end((error, response) => {
                if (error) {
                    res.end(error);
                } else {
                    res.end('\nRemoved Container ' + container + ' from the configuration.');
                }
            });
    }
});

app.get('/addcontainer', (req, res) => {
    const check_token = req.query.token;
    let {
        host
    } = req.query;
    const {
        container
    } = req.query;
    const {
        container_args
    } = req.query;
    const {
        heartbeat_args
    } = req.query;
    const {
        failover_constraints
    } = req.query;

    if (host.indexOf('*') > -1) {
        const min = 0;
        const max = total_nodes - 1;
        const number = Math.floor(Math.random() * (max - min + 1)) + min;
        host = config.layout[number].node;
    }

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        // Ensures that the host exists
        let proceed = 0;

        for (let i = 0; i < config.layout.length; i++) {
            if (config.layout[i].node.indexOf(host) > -1) {
                proceed++;
            }
        }

        if (proceed < 1) {
            res.end('\nError: Node does not exist!');
        } else {
            // Add Data to New Host
            for (let i = 0; i < config.layout.length; i++) {
                if (config.layout[i].node.indexOf(host) > -1) {
                    config.layout[i][container] = container_args;
                }
            }

            // Adds Heartbeat Data
            if (config.hb) {
                if (heartbeat_args) {
                    for (let i = 0; i < config.hb.length; i++) {
                        if (config.hb[i].node.indexOf(host) > -1) {
                            config.hb[i][container] = heartbeat_args;
                        }
                    }
                }
            }

            if (config.container_host_constraints) {
                if (failover_constraints) {
                    config.container_host_constraints.push({
                        container: failover_constraints
                    });
                }
            }

            superagent
                .post(`${scheme}${server}:${server_port}/updateconfig`)
                .send({ token: token, payload: JSON.stringify(config) })
                .set('accept', 'json')
                .end((error, response) => {
                    if (error) {
                        res.end(error);
                    } else {
                        superagent
                            .get(`${scheme}${server}:${server_port}/changehost`)
                            .query({ token: token, container, newhost: host, })
                            .end((error, response) => {
                                if (!error && response.text) {
                                    res.end('\nAdded ' + container + ' to the configuration.');
                                } else {
                                    res.end('\nError connecting with server.');
                                }
                            });
                    }
                });
        }
    }
});

function configure_loadbalancer() {
    let final_nginx_config = "";

    Object.keys(config.loadbalancer).forEach((get_node, i) => {
        Object.keys(config.loadbalancer[i]).forEach(key => {
            final_nginx_config = "";
            const parse_data = config.loadbalancer[i][key].split(',');
            const container_name = parse_data[0];
            const container_port = parse_data[parse_data.length - 2];
            const service_port = parse_data[parse_data.length - 1];
            const lb_hosts = parse_data.toString().split(',');

            final_nginx_config = 'stream { \n upstream ' + container_name + ' {';
            for (let i = 1; i < lb_hosts.length - 2; i++) {
                final_nginx_config += '\nserver ' + lb_hosts[i] + ':' + container_port + ';';
            }
            final_nginx_config += '\n } \nserver { \n listen ' + ' ' + service_port + '; \n proxy_pass ' + container_name + ';\n } \n }';

            const container_config = container_name + '.conf';
            fs.writeFile(container_config, final_nginx_config, err => {
                if (err) {
                    console.log(err);
                } else {
                    command = 'docker container stop picluster_lb;docker cp ' + container_config + ' picluster_lb:/etc/nginx/conf.d/;docker container restart picluster_lb ';
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            console.log(stderr);
                        } else {
                            console.log(stdout);
                        }
                    }, err => {
                        if (err) {
                            console.error('error:', err);
                        }
                    });
                }
            });
        });
    });
}

app.get('/update-container', (req, res) => {
    const check_token = req.query.token;
    const {
        container
    } = req.query;
    const {
        container_args
    } = req.query;
    const {
        heartbeat_args
    } = req.query;
    const {
        failover_constraints
    } = req.query;

    if ((check_token !== token) || (!check_token) || container.indexOf('*') > -1) {
        res.end('\nError: Invalid Credentials');
    } else {
        if (container_args) {
            Object.keys(config.layout).forEach((get_node, i) => {
                Object.keys(config.layout[i]).forEach(key => {
                    if (key.indexOf(container) > -1) {
                        config.layout[i][key] = container_args;
                    }
                });
            });
        }

        if (failover_constraints) {
            let proceed = 0;

            Object.keys(config.container_host_constraints).forEach((get_node, i) => {
                Object.keys(config.container_host_constraints[i]).forEach(key => {
                    const get_container_name = failover_constraints.split(',');
                    const parse_container = get_container_name[0];

                    if (config.container_host_constraints[i][key].indexOf(parse_container) > -1) {
                        if (failover_constraints.indexOf('none') > -1) {
                            proceed = 0;
                        } else {
                            proceed = 1;
                            config.container_host_constraints[i][key] = failover_constraints;
                        }
                    }
                });
            });

            if (proceed === 0) {
                if (failover_constraints.indexOf('none') > -1) {
                    for (let i = 0; i < config.container_host_constraints.length; i++) {
                        for (const key in config.container_host_constraints[i]) {
                            if (container.length > 0) {
                                const analyze = config.container_host_constraints[i][key].split(',');
                                if (container.indexOf(analyze[0]) > -1) {
                                    config.container_host_constraints.splice(i, i + 1);
                                }
                            }
                        }
                    }
                } else {
                    config.container_host_constraints.push({
                        container: failover_constraints
                    });
                }
            }
        }

        if (heartbeat_args) {
            let proceed = 0;
            if (config.hb.length === 0) {
                for (let i = 0; i < config.layout.length; i++) {
                    config.hb.push({
                        node: config.layout[i].node
                    });
                }
            }

            Object.keys(config.hb).forEach((get_node, i) => {
                Object.keys(config.hb[i]).forEach(key => {
                    if (key.indexOf(container) > -1) {
                        if (heartbeat_args.indexOf('delete') > -1) {
                            delete config.hb[i][key];
                            proceed = 1;
                        } else {
                            config.hb[i][key] = heartbeat_args;
                            proceed = 1;
                        }
                    }
                });
            });

            if (proceed === 0) {
                let node = '';
                Object.keys(config.layout).forEach((get_node, i) => {
                    Object.keys(config.layout[i]).forEach(key => {
                        if (key.indexOf(container) > -1) {
                            node = config.layout[i].node;
                        }
                    });
                });

                for (let i = 0; i < config.hb.length; i++) {
                    if (config.hb[i].node.indexOf(node) > -1 && heartbeat_args.indexOf('delete') === -1) {
                        config.hb[i][container] = heartbeat_args;
                    }
                }
            }
        }

        superagent
            .post(`${scheme}${server}:${server_port}/updateconfig`)
            .send({ token: token, payload: JSON.stringify(config) })
            .set('accept', 'json')
            .end((error, response) => {
                if (error) {
                    res.end(error);
                } else {
                    res.end('\nModified Container Arguments for ' + container);
                }
            });
    }
});

app.get('/lb', (req, res) => {
    const check_token = req.query.token;
    const {
        container
    } = req.query;
    const {
        container_port
    } = req.query;
    const {
        service_port
    } = req.query;
    const {
        lb_hosts
    } = req.query;

    if ((check_token !== token) || (!check_token) || container.indexOf('*') > -1) {
        res.end('\nError: Invalid Credentials');
    } else {

        if (lb_hosts) {
            let proceed = 0;

            Object.keys(config.loadbalancer).forEach((get_node, i) => {
                Object.keys(config.loadbalancer[i]).forEach(key => {
                    const get_container_name = lb_hosts.split(',');
                    const parse_container = get_container_name[0];

                    if (config.loadbalancer[i][key].indexOf(parse_container) > -1) {
                        if (lb_hosts.indexOf('none') > -1) {
                            proceed = 0;
                        } else {
                            proceed = 1;
                            config.loadbalancer[i][key] = lb_hosts + ',' + container_port + ',' + service_port;
                        }
                    }
                });
            });

            if (proceed === 0) {
                if (lb_hosts.indexOf('none') > -1) {
                    for (let i = 0; i < config.loadbalancer.length; i++) {
                        for (const key in config.loadbalancer[i]) {
                            if (container.length > 0) {
                                const analyze = config.loadbalancer[i][key].split(',');
                                if (container.indexOf(analyze[0]) > -1) {
                                    config.loadbalancer.splice(i, i + 1);
                                }
                            }
                        }
                    }
                } else {
                    config.loadbalancer.push({
                        container: lb_hosts + ',' + container_port + ',' + service_port
                    });
                }
            }
            configure_loadbalancer();
        }
        superagent
            .post(`${scheme}${server}:${server_port}/updateconfig`)
            .send({ token: token, payload: JSON.stringify(config) })
            .set('accept', 'json')
            .end((error, response) => {
                if (error) {
                    res.end(error);
                } else {
                    res.end('\nModified Container Arguments for ' + container);
                }
            });
    }
});

app.get('/changehost', (req, res) => {
    const check_token = req.query.token;
    let container = '';
    let original_host = '';
    let original_container_data = '';
    let original_heartbeat_data = '';
    const new_host = req.query.newhost;

    if (req.query.container) {
        container = req.query.container;
    }

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        // Ensures that the host exists
        let proceed = 0;
        for (let i = 0; i < config.layout.length; i++) {
            for (const key in config.layout[i]) {
                if (container.length > 0) {
                    if (config.layout[i].node.indexOf(new_host) > -1) {
                        proceed++;
                    }
                    if (key.indexOf(container) > -1) {
                        if (key.indexOf(config.layout[i].node)) {
                            proceed++;
                        }
                    }
                }
            }
        }

        // Find Current Host
        if (proceed < 2) {
            res.end('\nError: Node or Container does not exist!');
        } else {
            for (let i = 0; i < config.layout.length; i++) {
                for (const key in config.layout[i]) {
                    if (container.length > 0) {
                        if (key.indexOf(container) > -1) {
                            original_host = config.layout[i].node;
                            original_container_data = config.layout[i][key];
                            delete config.layout[i][key];
                        }
                    }
                }
            }

            // Checks for HB
            if (config.hb) {
                for (let i = 0; i < config.hb.length; i++) {
                    for (const key in config.hb[i]) {
                        if (container.length > 0) {
                            if (key.indexOf(container) > -1) {
                                original_heartbeat_data = config.hb[i][key];
                                delete config.hb[i][key];
                            }
                        }
                    }
                }
            }

            for (let i = 0; i < config.layout.length; i++) {
                if (config.layout[i].node.indexOf(new_host) > -1) {
                    config.layout[i][container] = original_container_data;
                }
            }

            // Adds Heartbeat Data
            if (config.hb) {
                if (original_heartbeat_data) {
                    for (let i = 0; i < config.hb.length; i++) {
                        if (config.hb[i].node.indexOf(new_host) > -1) {
                            config.hb[i][container] = original_heartbeat_data;
                        }
                    }
                }
            }

            superagent
                .post(`${scheme}${server}:${server_port}/updateconfig`)
                .send({ token: token, payload: JSON.stringify(config) })
                .set('accept', 'json')
                .end((error, response) => {
                    if (error) {
                        res.end(error);
                    } else {
                        migrate(container, original_host, new_host, original_container_data);
                        res.end('\nMigration may take awhile. Please observe the logs and running containers for the latest information.');
                    }
                });
        }
    }
});

function delete_function(name, node) {

    superagent
        .post(scheme + node + ':' + agent_port + '/run')
        .send({ token: token, command: 'docker container rm -f ' + name })
        .set('accept', 'json')
        .end((error, response) => {
            if (error) {
                console.log('\n' + error);
            }
        });
}

app.post('/listcontainers', (req, res) => {
    let {
        node
    } = req.body;
    const check_token = req.body.token;
    const output = [];
    let container;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        for (let i = 0; i < config.layout.length; i++) {
            for (const key in config.layout[i]) {
                if (config.layout[i].hasOwnProperty(key)) {
                    container = key;
                    node = config.layout[i].node;
                    const check_port = config.layout[i][key];
                    if (check_port !== node) {
                        output.push(container);
                    }
                }
            }
        }
        res.send(output);
    }
});

app.post('/listnodes', (req, res) => {
    const check_token = req.body.token;
    const output = [];
    let node;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        for (let i = 0; i < config.layout.length; i++) {
            for (const key in config.layout[i]) {
                if (config.layout[i].hasOwnProperty(key)) {
                    node = config.layout[i].node;
                    const port_check = config.layout[i][key];
                    if (port_check === node) {
                        output.push(node);
                    }
                }
            }
        }
        res.send(output);
    }
});

function copyToAgents(data, file, config_file, temp_file) {
    Object.keys(config.layout).forEach((get_node, i) => {
        const {
            node
        } = config.layout[i];

        const formData = {
            name: file,
            token,
            config_file: config_file,
            data: data
        };

        setTimeout(() => {
            superagent
                .post(`${scheme}${node}:${agent_port}/receive-file`)
                .send(formData)
                .set('accept', 'json')
                .end((error, response) => {
                    try {
                        if (!config_file) {
                            addLog('\nCopied ' + file + ' to ' + node);
                            console.log('\nCopied ' + file + ' to ' + node);
                        }
                    } catch (error) {
                        console.log('\nResponse= ' + response);
                        console.log('\n' + formData);
                        console.log('\nError sending file to agent: ' + error);
                    }
                });
        }, 3000);
    });
    if (temp_file) {
        fs.unlink(temp_file, error => {
            if (error) {
                console.log(error);
            }
        });
    }
}

app.post('/receive-file', upload.single('file'), (req, res) => {
    const check_token = req.body.formData.token;
    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        copyToAgents(req.body, req.body.formData.original_name, '', req.body.formData.file.path);
        res.end('');
    }
});

app.post('/listcommands', (req, res) => {
    const check_token = req.body.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else if (config.commandlist) {
        res.end(JSON.stringify(config.commandlist));
    } else {
        res.end('');
    }
});

function swarm_remove() {
    for (let i = 0; i < config.layout.length; i++) {
        const {
            node
        } = config.layout[i];

        superagent
            .post(`${scheme}${node}:${agent_port}/run`)
            .send({ token: token, command: 'docker swarm leave --force' })
            .set('accept', 'json')
            .end((error, response) => {
                if (error) {
                    console.log('An error has occurred.');
                } else {
                    const results = JSON.parse(response.text);
                    addLog('\nNode:' + results.node + '\n' + results.output);
                }
            });
    }
}

function swarm_nodes(swarm_token, host) {
    for (let i = 0; i < config.layout.length; i++) {
        const {
            node
        } = config.layout[i];
        if (host.indexOf(node) > -1) {
            console.log('\n' + node + ' is already set as the master.');
        } else {
            superagent
                .post(`${scheme}${server}:${server_port}/updateconfig`
                    `${scheme}${node}:${agent_port}/run`)
                .send({ token: token, command: 'docker swarm join --token ' + swarm_token + ' ' + host })
                .set('accept', 'json')
                .end((error, response) => {
                    if (error) {
                        console.log('An error has occurred.');
                    } else {
                        const results = JSON.parse(response.text);
                        addLog('\nNode:' + results.node + '\n' + results.output);
                    }
                });
        }
    }
}

app.post('/swarm-create', (req, res) => {
    const check_token = req.body.token;
    const {
        host
    } = req.body;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        for (let i = 0; i < config.layout.length; i++) {
            const {
                node
            } = config.layout[i];

            if (host.indexOf(node) > -1) {
                superagent
                    .post(`${scheme}${node}:${agent_port}/run`)
                    .send({ token: token, command: 'docker swarm init' })
                    .set('accept', 'json')
                    .end((error, response) => {
                        if (error) {
                            res.end('An error has occurred.');
                        } else {
                            const results = JSON.parse(response.text);
                            const get_output = results.output.toString();

                            if (get_output.indexOf('SWMTKN') > -1 || config.swarm_token) {
                                if (!config.swarm_token) {
                                    const get_swarm_token_line = get_output.split('--token');
                                    const get_swarm_token = get_swarm_token_line[1].split(' ');
                                    config.swarm_token = get_swarm_token[1];

                                    superagent
                                        .post(`${scheme}${server}:${server_port}/updateconfig`)
                                        .send({ token: token, payload: JSON.stringify(config) })
                                        .set('accept', 'json')
                                        .end((error, response) => {
                                            if (error) {
                                                res.end('An error occurred: ' + error);
                                            } else {
                                                bootstrap.status = 1;
                                                console.log('\nAdded Swarm Token to config file.');
                                            }
                                        });
                                }
                                swarm_nodes(config.swarm_token, host);
                            } else {
                                res.end('Error creating Swarm.' + results.output);
                            }
                        }
                    });
            }
        }
        res.end('Swarm Operation Complete');
    }
});

app.post('/swarm-network-create', (req, res) => {
    const check_token = req.body.token;
    const {
        host
    } = req.body;
    const {
        network
    } = req.body;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        for (let i = 0; i < config.layout.length; i++) {
            const {
                node
            } = config.layout[i];

            if (host.indexOf(node) > -1) {
                superagent
                    .post(`${scheme}${node}:${agent_port}/run`)
                    .send({ token: token, command: 'docker network create -d overlay --attachable ' + network })
                    .set('accept', 'json')
                    .end((error, response) => {
                        if (error) {
                            res.end('An error has occurred.');
                        } else {
                            const results = JSON.parse(response.text);
                            res.end(results.output);
                        }
                    });
            }
        }
        res.end('');
    }
});

app.post('/swarm-remove', (req, res) => {
    if (config.swarm_token) {
        delete config.swarm_token;
        superagent
            .post(`${scheme}${server}:${server_port}/updateconfig`)
            .send({ token: token, payload: JSON.stringify(config) })
            .set('accept', 'json')
            .end((error, response) => {
                if (error) {
                    console.log('An error occurred: ' + error);
                } else {
                    bootstrap.status = 1;
                    console.log('\nRemoved Swarm Token from config file.');
                }
            });
    }

    const check_token = req.body.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        swarm_remove();
        res.end('\nRemoved Swarm Token from config file.');
    }
});

app.post('/exec', (req, res) => {
    const check_token = req.body.token;
    let selected_node = '';
    let command_log = '';
    const url = [];

    if (req.body.node) {
        selected_node = req.body.node;
    }

    if (selected_node.indexOf('*') > -1) {
        selected_node = '';
    }

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        for (let i = 0; i < config.layout.length; i++) {
            const {
                node
            } = config.layout[i];
            const make_url = `${scheme}${node}:${agent_port}/run`;

            if (selected_node.length > -1 && selected_node.indexOf(node) > -1) {
                url.push(make_url);
            }

            if (selected_node.length === 0) {
                url.push(make_url);
            }
        }

        async.eachSeries(url, (url, cb) => {
            superagent
                .post(url)
                .send({ token: token, command: req.body.command })
                .set('accept', 'json')
                .end((error, response) => {
                    try {
                        const data = JSON.parse(response.text);
                        command_log += 'Node: ' + data.node + '\n\n' + data.output + '\n\n';
                        cb(error);
                    } catch (error) {
                        console.log(error);
                    }
                });
        }, err => {
            if (err) {
                console.log('\nError: ' + err);
            }
            res.end(command_log);
        });
    }
});

app.post('/syslog', (req, res) => {
    const check_token = req.body.token;
    let complete_syslog = '';
    const url = [];

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        for (let i = 0; i < config.layout.length; i++) {
            const {
                node
            } = config.layout[i];

            make_url = `${scheme}${node}:${agent_port}/run`;
            url.push(make_url);
        }

        async.eachSeries(url, (url, cb) => {
            superagent
                .post(url)
                .send({ token: token, command: config.syslog })
                .set('accept', 'json')
                .end((error, response) => {
                    try {
                        const data = JSON.parse(response.text);
                        complete_syslog += 'Node: ' + data.node + '\n\n' + data.output + '\n\n';
                        cb(error);
                    } catch (error) {
                        console.log(error);
                    }
                });
        }, err => {
            if (err) {
                console.log('\nError: ' + err);
            }
            res.end(complete_syslog);
        });
    }
});

app.post('/prune', (req, res) => {
    const check_token = req.body.token;
    const url = [];
    let command_log = '';

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        for (let i = 0; i < config.layout.length; i++) {
            const {
                node
            } = config.layout[i];
            const make_url = `${scheme}${node}:${agent_port}/run`;
            url.push(make_url);
        }

        async.eachSeries(url, (url, cb) => {
            superagent
                .post(url)
                .send({ token: token, command: 'docker system prune -a -f' })
                .set('accept', 'json')
                .end((error, response) => {
                    try {
                        const data = JSON.parse(response.text);
                        command_log += 'Node: ' + data.node + '\n\n' + data.output + '\n\n';
                        cb(error);
                    } catch (error) {
                        console.log(error);
                    }
                });
        }, err => {
            if (err) {
                console.log('\nError: ' + err);
            }
            res.end(command_log);
        });
    }
});

function move_container(container, newhost) {
    console.log('\nMigrating container ' + container + ' to ' + newhost + '......');
    addLog('\nMigrating container ' + container + ' to ' + newhost + '......');
    superagent
        .get(`${scheme}${server}:${server_port}/changehost`)
        .query({ token: token, container, newhost })
        .end((error, response) => {
            if (error) {
                console.log('Error connecting with server. ' + error);
            } else {
                config.automatic_heartbeat = 'enabled';
            }
        });
}

function container_failover(container) {
    let container_fail_counter = 0;
    let proceed = '';

    for (const key in container_faillog) {
        if (log.hasOwnProperty(key)) {
            if (container_faillog[key].indexOf(container) > -1) {
                container_fail_counter++;
            }
        }
    }

    if (container_fail_counter >= 3) {
        for (const bkey in container_faillog) {
            if (container_faillog[bkey].indexOf(container) > -1) {
                delete container_faillog[bkey];
                proceed = 1;
            }
        }

        if (proceed) {
            for (const key in config.container_host_constraints) {
                if (config.container_host_constraints.hasOwnProperty(key)) {
                    const analyze = config.container_host_constraints[key].container.split(',');
                    if (container.indexOf(analyze[0]) > -1) {
                        analyze.splice(0, 1);
                        const newhost = analyze[Math.floor(Math.random() * analyze.length)];
                        move_container(container, newhost);
                        config.automatic_heartbeat = 'disabled';
                    }
                }
            }
        }
    }
}

function hb_check(node, container_port, container) {
    if (config.automatic_heartbeat.indexOf('enabled') > -1) {
        const client = config.ssl ? new tls.TLSSocket() : new net.Socket();

        client.connect(container_port, node, container, () => {});

        client.on('end', () => {
            addLog('\nA Heart Beat Check Just Ran.');
        });

        client.on('error', () => {
            addLog('\n' + container + ' failed on: ' + node);
            console.log('\n' + container + ' failed on: ' + node);

            if (config.container_host_constraints) {
                container_faillog.push(container);
                container_failover(container);
            }

            superagent
                .get(`${scheme}${server}:${server_port}/restart`)
                .query({ token: token, container })
                .end((error, response) => {
                    if (error) {
                        console.log(error);
                    }
                });
        });
    }
}

app.get('/hb', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        let node = '';
        let check_port = '';
        let container = '';

        for (let i = 0; i < config.hb.length; i++) {
            for (const key in config.hb[i]) {
                if (config.hb[i].hasOwnProperty(key)) {
                    container = key;
                    node = config.hb[i].node;
                    check_port = config.hb[i][key];

                    if (check_port !== node) {
                        hb_check(node, check_port, container);
                    }
                }
            }
        }
        res.end('');
    }
});

app.get('/log', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        if (config.elasticsearch) {
            elasticsearch(JSON.stringify(log));
        }
        res.send(log);
    }
});

app.get('/rsyslog', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .get(`${scheme}${rsyslog_host}:${agent_port}/rsyslog`)
            .query({ token: token })
            .end((error, response) => {
                if (!error && response.text) {
                    res.end(response.text);
                } else {
                    res.end('Error connecting with server. ' + error);
                }
            });
    }
});

function reloadConfig() {
    if (process.env.PICLUSTER_CONFIG) {
        config = JSON.parse(fs.readFileSync(process.env.PICLUSTER_CONFIG, 'utf8'));
    } else {
        config = JSON.parse(fs.readFileSync('../config.json', 'utf8'));
    }

    token = config.token;
    dockerFolder = config.docker;
    rsyslog_host = config.rsyslog_host;

    if (config.heartbeat_interval && config.automatic_heartbeat) {
        if (config.automatic_heartbeat.indexOf('enabled') > -1) {
            console.log('\nEnabing Heartbeat.');
            automatic_heartbeat();
        }
    }
    if (config.elasticsearch) {
        elasticsearch(config);
    }
    addLog('\nReloading Config.json\n');
}

app.get('/getconfig', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        res.send(config);
    }
});

app.post('/elasticsearch', (req, res) => {
    const check_token = req.body.token;
    const elasticsearch = req.body.elasticsearch_url;
    const {
        mode
    } = req.body;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        if (mode === 'add') {
            if (config.elasticsearch) {
                console.log('\nError, Elasticsearch is already configured.');
            } else {
                config.elasticsearch = elasticsearch;
                console.log('\nAdded Elasticsearch configuration for: ' + elasticsearch);
            }
        }
        if (mode === 'kibana') {
            if (config.kibana) {
                console.log('\nError, Kibana is already configured.');
            } else {
                config.kibana = elasticsearch;
                console.log('\nAdded Kibana configuration for: ' + elasticsearch);
            }
        }
        if (mode === 'delete') {
            if (config.kibana) {
                console.log('\nDeleted Kibana configuration.');
                delete config.kibana;
            }
            if (config.elasticsearch) {
                delete config.elasticsearch;
                console.log('\nDeleted Elasticsearch configuration.');
            }
        }

        superagent
            .post(`${scheme}${server}:${server_port}/updateconfig`)
            .send({ token: token, payload: JSON.stringify(config) })
            .set('accept', 'json')
            .end((error, response) => {
                if (error) {
                    res.end('An error occurred: ' + error);
                } else {
                    res.end();
                    console.log('\nUpdated Elasticsearch configuration.');
                }
            });
    }
});

app.post('/updateconfig', (req, res) => {
    let {
        payload
    } = req.body;
    const check_token = req.body.token;

    try {
        const verify_payload = JSON.parse(req.body.payload);
        if ((check_token !== token) || (!check_token)) {
            res.end('\nError: Invalid Credentials');
        } else {
            payload = JSON.stringify(verify_payload, null, 4);

            setTimeout(() => {
                fs.writeFile(config_file, payload, err => {
                    if (err) {
                        console.log('\nError while writing config.' + err);
                    } else {
                        copyToAgents(payload, config_file, 'config', '');
                        reloadConfig();
                        res.end('Updated Configuration.');
                    }
                });
            }, 3000);
        }
    } catch (error) {
        res.end('Error: Invalid JSON. Configuration not saved.');
    }
});

if (config.ssl && config.ssl_cert && config.ssl_key) {
    console.log('SSL Server API enabled');
    const ssl_options = {
        cert: fs.readFileSync(config.ssl_cert),
        key: fs.readFileSync(config.ssl_key)
    };
    const server = https.createServer(ssl_options, app);
    server.listen(server_port, () => {
        console.log('Listening on port %d', server_port);
    });
} else {
    console.log('Non-SSL Server API enabled');
    const server = http.createServer(app);
    server.listen(server_port, () => {
        console.log('Listening on port %d', server_port);
    });
}