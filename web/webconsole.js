const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const express = require('express');
const superagent = require('superagent');
const { response } = require('express');
const bodyParser = require('body-parser');

let config = JSON.parse(fs.readFileSync((process.env.PICLUSTER_CONFIG ? process.env.PICLUSTER_CONFIG : '../config.json'), 'utf8'));

process.env.NODE_TLS_REJECT_UNAUTHORIZED = config.ssl_self_signed ? '0' : '1';

const app = express();
app.use(bodyParser());

app.use('/assets', express.static(path.join(__dirname, 'assets'), {
    maxage: '48h'
}));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules'), {
    maxage: '48h'
}));

const upload = multer({
    dest: '../'
});
const scheme = config.ssl ? 'https://' : 'http://';
const ssl_self_signed = config.ssl_self_signed === false;
const request_timeout = 5000;
const {
    web_port
} = config;
let syslog = config.syslog ? config.syslog : '';
const {
    doc_dir
} = config;
let {
    theme
} = config;
let logo_slug = path.join(__dirname, '/assets/images/theme/', theme, '/logo.png');
let {
    token
} = config;
let user = config.web_username;
let password = config.web_password;
let server = config.web_connect;
let {
    server_port
} = config;
let nodedata = '';

/*
Removing for now
if (fs.existsSync(path.normalize(doc_dir))) {
  app.use('/docs', express.static(path.join(__dirname, doc_dir)));
}
 */

function getData() {
    setTimeout(() => {
        try {
            superagent
                .get(`${scheme}${server}:${server_port}/nodes`)
                .query({ token: token })
                .end((error, response) => {
                    if (error || !response.text) {
                        console.log('\nError connecting with server. ' + error);
                    } else if (response.text) {
                        nodedata = JSON.parse(response.text);
                    }
                });
        } catch (error2) {
            console.error(error2);
        }
        getData();
    }, 5000);
}
getData();

function get_file_list_by_extention(dirpath, extention) {
    const files = fs.readdirSync(dirpath);
    const output = [];

    for (const i in files) {
        if (path.extname(files[i]) === extention) {
            output.push(files[i]);
        }
    }

    return output;
}

/*
Removing for now

function serve_doc_pages() {
  const doc_pages = get_file_list_by_extention(path.join(__dirname, doc_dir.toString()), '.md');

  for (const i in doc_pages) {
    if (i) {
      app.get('/doc' + i, (req, res) => {
        res.sendFile(path.join(__dirname + '/' + doc_dir + '/' + doc_pages[i]));
      });
    }
  }
}
  */

app.get('/exec.html', (req, res) => {
    const check_token = req.query.token;
    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        res.sendFile(path.join(__dirname, '/exec.html'));
    }
});

app.get('/config-edit.html', (req, res) => {
    const check_token = req.query.token;
    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        res.sendFile(path.join(__dirname, '/config-edit.html'));
    }
});

app.get('/monitoring.html', (req, res) => {
    const check_token = req.query.token;
    if ((check_token !== token) || (!check_token) || (!config.monitoring)) {
        res.end('\nError: Invalid Credentials or invalid configuration.');
    } else {
        res.redirect(config.monitoring);
    }
});

app.post('/sendconfig', (req, res) => {
    const check_token = req.body.token;
    const {
        payload
    } = req.body;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .post(`${scheme}${server}:${server_port}/updateconfig`)
            .send({ token: check_token, payload })
            .set('accept', 'json')
            .end((error, response) => {
                try {
                    if (error) {
                        res.end(error);
                    } else {
                        updateConfig(payload);
                        res.end(response.text);
                    }
                } catch (error) {}
            });
    }
});

function reloadVariables() {
    try {
        config = JSON.parse(fs.readFileSync((process.env.PICLUSTER_CONFIG ? process.env.PICLUSTER_CONFIG : '../config.json'), 'utf8'));
        token = config.token;
        user = config.web_username;
        password = config.web_password;
        server = config.web_connect;
        server_port = config.server_port;
        syslog = config.syslog;
        theme = config.theme;
        logo_slug = path.join(__dirname, '/assets/images/theme/', theme, '/logo.png');
    } catch (error) {
        console.log('\nError parsing JSON while trying to update config');
    }
}

function updateConfig(payload) {
    let updated_config_file = '';

    if (process.env.PICLUSTER_CONFIG) {
        updated_config_file = process.env.PICLUSTER_CONFIG;
    } else {
        updated_config_file = '../config.json';
    }

    setTimeout(() => {
        fs.writeFile(updated_config_file, payload, err => {
            if (err) {
                console.log(err);
            } else {
                reloadVariables();
            }
        });
    }, 10000);
}

app.post('/', (req, res) => {
    const get_user = req.body.username;
    const get_pass = req.body.password;

    if (get_user === user && get_pass === password) {
        const auth_data = {
            token,
            syslog
        };
        res.send(auth_data);
    } else {
        res.end('Access Denied!');
    }
});

app.post('/elasticsearch', (req, res) => {
    const check_token = req.body.token;
    const {
        elasticsearch_url
    } = req.body;
    const {
        mode
    } = req.body;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .post(`${scheme}${server}:${server_port}/elasticsearch`)
            .send({ token: check_token, elasticsearch_url: elasticsearch_url, mode: mode })
            .set('accept', 'json')
            .end((error, response) => {
                if (error) {
                    res.end(error);
                } else {
                    display_log(data => {
                        res.end(response.text);
                    });
                }
            });
    }
});

app.get('/listdocs', (req, res) => {
    res.json(get_file_list_by_extention(path.join(__dirname, doc_dir.toString()), '.md'));
});

app.get('/listregistries', (req, res) => {
    const check_token = req.query.token;
    if (!check_token || check_token !== token) {
        return res.status(401).end('\nError: Invalid Credentials');
    }

    const registries = [{
        name: 'hub.docker.com'
    }];

    if (config.dockerRegistries && config.dockerRegistries.length > 0) {
        config.dockerRegistries.forEach(registry => {
            registries.push({
                name: registry
            });
        });
    }

    res.json(registries);
});

app.get('/remoteimagetags', (req, res) => {
    const {
        registry
    } = req.query;
    const {
        image
    } = req.query;
    const {
        page
    } = req.query || 1;
    const {
        username
    } = req.query || '';
    const {
        password
    } = req.query || '';
    const check_token = req.query.token;

    if (!check_token || check_token !== token) {
        return res.status(401).end('\nError: Invalid Credentials');
    }

    if (!registry || !image) {
        return res.status(400).end('\nError: Invalid Credentials');
    }

    let endpoint;
    switch (registry) {
        case 'hub.docker.com':
            endpoint = 'https://hub.docker.com/v2/repositories/' + ((image.indexOf('/') === -1) ? ('library/' + image) : image) + '/tags/?page=1' + '&page_size=500';
            break;
        default:
            // Custom registries
            endpoint = ((registry.startsWith('http://') || registry.startsWith('https://')) ? registry : 'https://' + registry) + '/v2/' + image + '/tags/list';
            break;
    }

    const options = {
        url: endpoint,
        headers: ((username && password)) ? {
            Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
        } : {}
    };

    superagent
        .get(options.url)
        .set(options.headers)
        .end((error, response) => {
            if (error || !response.text) {
                error = error;
            }

            res.status(response.statusCode).end((error) ? JSON.stringify({
                error: error.toString()
            }) : response.text);
        });
});

app.get('/remoteimages', (req, res) => {
    const {
        registry
    } = req.query;
    const {
        image
    } = req.query;
    const {
        username
    } = req.query || '';
    const {
        password
    } = req.query || '';
    const check_token = req.query.token;

    if (!check_token || check_token !== token) {
        return res.status(401).end('\nError: Invalid Credentials');
    }

    if (!registry || !image) {
        return res.status(400).end('\nError: Bad Request');
    }

    let endpoint;
    switch (registry) {
        case 'hub.docker.com':
            endpoint = 'https://hub.docker.com/v2/search/repositories/?page=1' + '&query=' + image;
            break;
        default:
            // Custom registries
            endpoint = ((registry.startsWith('http://') || registry.startsWith('https://')) ? registry : 'https://' + registry) + '/v2/_catalog';
            break;
    }

    const options = {
        url: endpoint,
        headers: ((username && password)) ? {
            Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
        } : {}
    };

    superagent
        .get(options.url)
        .query({ token: check_token })
        .set(options.headers)
        .end((error, response) => {
            if (error || !response.text) {
                error = body;
            }

            res.status(response.statusCode).end((error) ? JSON.stringify({
                error: error.toString()
            }) : response.text);
        });
});

app.post('/listcommands', (req, res) => {
    const check_token = req.body.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        const token_body = JSON.stringify({
            token
        });

        superagent
            .post(`${scheme}${server}:${server_port}/listcommands`)
            .send({ token: check_token })
            .set('accept', 'json')
            .end((error, response) => {
                if (error) {
                    res.end(error);
                } else {
                    res.end(response.text);
                }
            });
    }
});

function display_log(callback) {
    clear_log(() => {
        setTimeout(() => {
            try {
                superagent
                    .get(`${scheme}${server}:${server_port}/log`)
                    .query({ token: token })
                    .end((error, response) => {
                        if (!error || !response.text) {
                            callback('\nError connecting with server.');
                        } else {
                            callback(response.text);
                        }
                    });
            } catch (error) {
                console.log(error);
            }
        }, request_timeout);
    });
}

function clear_log(callback) {
    superagent
        .get(`${scheme}${server}:${server_port}/clearlog`)
        .query({ token: token })
        .end((error, response) => {
            if (!error && !response.text) {
                callback('');
            } else {
                console.log('\nError clearing log: ' + error);
            }
        });
}

app.post('/exec', (req, res) => {
    const check_token = req.body.token;
    const {
        node
    } = req.body;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .post(`${scheme}${server}:${server_port}/exec`)
            .send({ token: check_token, command: req.body.command, node: node })
            .set('accept', 'json')
            .end((error, response) => {
                try {
                    if (error) {
                        res.end(error);
                    } else {
                        res.end(response.text);
                    }
                } catch (error2) {
                    res.end('\nAn error has occurred while retrieving the command.');
                }
            });
    }
});

app.get('/syslog', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .post(`${scheme}${server}:${server_port}/syslog`)
            .send({ token: check_token })
            .set('accept', 'json')
            .end((error, response) => {
                try {
                    if (!error || response.text) {
                        res.end(response.text);
                    } else {
                        res.end('\nAn error has occurred while retrieving the Syslog.');
                    }
                } catch (error2) {
                    console.log(error2);
                }

            });
    }
});

app.get('/rsyslog', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .get(`${scheme}${server}:${server_port}/rsyslog`)
            .query({ token: check_token })
            .end((error, response) => {
                if (!error || response.text) {
                    res.end(response.text);
                } else {
                    res.end('\nError connecting with server.');
                }
            });
    }
});

app.get('/prune', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .post(`${scheme}${server}:${server_port}/prune`)
            .send({ token: token })
            .set('accept', 'json')
            .end((error, response) => {
                try {
                    if (error) {
                        res.end(error);
                    } else {
                        res.end(response.text);
                    }
                } catch (error2) {
                    res.end('\nAn error has occurred while cleaning Docker.');
                }
            });
    }
});

app.get('/clear-functions', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .get(`${scheme}${server}:${server_port}/clear-functions`)
            .query({ token: check_token })
            .end((error, response) => {
                if (!error || !response.text) {
                    res.end('Sent request to delete functions.');
                } else {
                    res.end('\nError connecting with server.');
                }
            });
    }
});

app.get('/function', (req, res) => {
    const check_token = req.query.token;
    const get_function = req.query.function;
    let get_args = req.query.container_args;
    if (req.query.container_args) {
        get_args = req.query.container_args;
    }

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .get(`${scheme}${server}:${server_port}/function`)
            .query({ token: check_token, function: get_function, container_args: get_args })
            .end((error, response) => {
                if (!error || !response.text) {
                    res.end('');
                } else {
                    console.log('\n' + error);
                }
            });
    }
});

app.post('/changehost', (req, res) => {
    const check_token = req.body.token;
    const {
        newhost
    } = req.body;
    let container;

    if (req.body.container) {
        container = req.body.container;
        if (container.indexOf('Everything') > -1) {
            container = '';
        }
    }

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .get(`${scheme}${server}:${server_port}/changehost`)
            .query({ token: check_token, container: container, newhost: newhost })
            .end((error, response) => {
                if (!error || !response.text) {
                    display_log(data => {
                        res.end(response.text);
                    });
                } else {
                    res.end('\nError connecting with server.');
                }
            });
    }
});

app.post('/lb', (req, res) => {
    const check_token = req.body.token;
    const {
        container_args
    } = req.body;
    const {
        container
    } = req.body;
    const {
        heartbeat_args
    } = req.body;
    const {
        container_port
    } = req.body;
    const {
        service_port
    } = req.body;
    const {
        lb_hosts
    } = req.body;


    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else if (container) {
        superagent
            .get(`${scheme}${server}:${server_port}/lb`)
            .query({ token: check_token, lb_hosts: lb_hosts, container_port: container_port, service_port: service_port, container: container })
            .end((error, response) => {
                try {
                    if (!error || response.text) {
                        display_log(data => {
                            res.end(response.text);
                        });
                    } else {
                        res.end('\nError connecting with server.');
                    }
                } catch (error) {};
            });
    } else {
        res.end('\nError missing some parameters.');
    }
});


app.post('/update-container', (req, res) => {
    const check_token = req.body.token;
    const {
        container_args
    } = req.body;
    const {
        container
    } = req.body;
    const {
        heartbeat_args
    } = req.body;
    const {
        failover_constraints
    } = req.body;
    const {
        container_port
    } = req.body;
    const {
        service_port
    } = req.body;
    const {
        lb_hosts
    } = req.body;


    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else if (container) {
        superagent
            .get(`${scheme}${server}:${server_port}/update-container`)
            .query({ token: check_token, lb_hosts: lb_hosts, container_port: container_port, service_port: service_port, container: container, container_args: container_args, heartbeat_args: heartbeat_args, failover_constraints: failover_constraints })
            .end((error, response) => {
                try {
                    if (!error || response.text) {
                        display_log(data => {
                            res.end(response.text);
                        });
                    } else {
                        res.end('\nError connecting with server.');
                    }
                } catch (error) {};
            });
    } else {
        res.end('\nError missing some parameters.');
    }
});

app.post('/addcontainer', (req, res) => {
    const check_token = req.body.token;
    const {
        host
    } = req.body;
    const {
        container_args
    } = req.body;
    const {
        heartbeat_args
    } = req.body;
    let {
        failover_constraints
    } = req.body;
    const {
        container
    } = req.body;

    if (failover_constraints) {
        if (failover_constraints.indexOf('none') > -1) {
            failover_constraints = '';
        }
    }

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else if ((container) && (container_args) && (host)) {
        superagent
            .get(`${scheme}${server}:${server_port}/addcontainer`)
            .query({ token: check_token, container: container, host: host, container_args: container_args, heartbeat_args: heartbeat_args, failover_constraints: failover_constraints })
            .end((error, response) => {
                if (!error || !response.text) {
                    display_log(data => {
                        res.end(response.text);
                    });
                } else {
                    res.end('\nError connecting with server.' + error);
                }
            });
    } else {
        res.end('\nError missing some parameters.');
    }
});

function sendFile(original_name, temp_file, data) {
    const formData = {
        original_name,
        name: temp_file,
        token,
        file: data
    };

    superagent
        .post(`${scheme}${server}:${server_port}/receive-file`)
        .send({ formData })
        .set('accept', 'json')
        .end((error, response) => {
            if (error) {
                console.error('upload failed:', error);
            } else {
                fs.unlink(temp_file, error => {
                    if (error) {
                        console.log(error);
                    } else {
                        console.log('Upload successful!');
                    }
                });
            };
        });

};

app.post('/upload', upload.single('file'), (req, res) => {
    const check_token = req.body.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        fs.readFile(req.file.path, (err, data) => {
            if (err) {
                console.log('\nReadFile Error:' + err);
            }
            sendFile(req.file.originalname, req.file.path, data);
            res.end('');
        });
    }
});

app.post('/removecontainerconfig', (req, res) => {
    const check_token = req.body.token;
    const {
        container
    } = req.body;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else if (container) {
        superagent
            .get(`${scheme}${server}:${server_port}/removecontainerconfig`)
            .query({ token: check_token, container: container })
            .end((error, response) => {
                if (!error || !response.text) {
                    display_log(data => {
                        res.end(response.text);
                    });
                } else {
                    res.end('\nError connecting with server.');
                }
            });
    } else {
        res.end('\nError container name.');
    }
});

app.post('/swarm-remove', (req, res) => {
    const check_token = req.body.token;
    const {
        host
    } = req.body;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else if (host) {
        superagent
            .post(`${scheme}${server}:${server_port}/swarm-remove`)
            .send({ token: token, host: host })
            .set('accept', 'json')
            .end((error, response) => {
                if (!error || !response.text) {
                    display_log(data => {
                        res.end(response.text);
                    });
                } else {
                    res.end('\nError connecting with server.');
                }
            });
    } else {
        res.end('\nError missing host name.');
    }
});

app.post('/swarm-create', (req, res) => {
    const check_token = req.body.token;
    const {
        host
    } = req.body;

    if ((check_token !== token) || (!check_token) || (!host)) {
        res.end('\nError: Invalid Credentials or hostname missing');
        console.log('\nDebug Error: Invalid Credentials or hostname missing');
    } else {
        superagent
            .post(`${scheme}${server}:${server_port}/swarm-create`)
            .send({ token: token, host: host })
            .set('accept', 'json')
            .end((err, response) => {
                if (!err && response.text) {
                    display_log(data => {
                        res.end(response.text);
                    });
                } else {
                    res.end('\nError connecting with server.');
                    console.log('\nDebug Error: Error connecting with server.');
                }
            });
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
    if ((check_token !== token) || (!check_token) || !host) {
        res.end('\nError: Invalid Credentials or host not specified');
    } else {

        superagent
            .post(`${scheme}${server}:${server_port}/swarm-network-create`)
            .send({ token, host, network })
            .set('accept', 'json')
            .end((error, response) => {
                if (!error && !response.text) {
                    display_log(data => {
                        res.end(response.text);
                    });
                } else {
                    res.end('\nError connecting with server.\n' + error);
                }
            });
    }
});

app.post('/addhost', (req, res) => {
    const check_token = req.body.token;
    const {
        host
    } = req.body;

    if ((check_token !== token) || (!check_token) || !(host)) {
        res.end('\nError: Invalid Credentials or hostname empty.');
    } else {
        superagent
            .get(`${scheme}${server}:${server_port}/addhost`)
            .query({ token: check_token, host: host })
            .end((error, response) => {
                if (!error || !response.text) {
                    display_log(data => {
                        res.end(response.text);
                    });
                } else {
                    res.end('\nError connecting with server.' + response.text);
                }
            });
    }
});

app.post('/rmhost', (req, res) => {
    const check_token = req.body.token;
    const {
        host
    } = req.body;

    if ((check_token !== token) || (!check_token) || !(host)) {
        res.end('\nError: Invalid Credentials or hostname empty.');
    } else {
        superagent
            .get(`${scheme}${server}:${server_port}/rmhost`)
            .query({ token: check_token, host: host })
            .end((error, response) => {
                try {
                    if (!error || response.text) {
                        display_log(data => {
                            res.end(response.text);
                        });
                    } else {
                        res.end('\nError connecting with server.' + response.text);
                    }
                } catch (error2) {

                }
            });
    }
});

app.post('/manage', (req, res) => {
    const check_token = req.body.token;
    const {
        operation
    } = req.body;
    let container;

    if (req.body.container) {
        container = req.body.container;
        if (container.indexOf('Everything') > -1) {
            container = '';
        }
    }

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .get(`${scheme}${server}:${server_port}/manage`)
            .query({ token: check_token, container: container, operation: operation })
            .end((error, response) => {
                try {
                    if (error) {
                        res.end(error);
                    } else {
                        res.end(response.text);
                    }
                } catch (error2) {
                    res.end('\nAn error has occurred while trying to manage the container(s).');
                }
            });
    }
});

app.post('/manage-image', (req, res) => {
    const check_token = req.body.token;
    const {
        operation
    } = req.body;
    let container;
    const {
        no_cache
    } = req.body;

    if (req.body.container) {
        container = req.body.container;
        if (container.indexOf('Everything') > -1) {
            container = '';
        }
    }

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .get(`${scheme}${server}:${server_port}/manage-image`)
            .query({ token: check_token, container: container, operation: operation, no_cache: no_cache })
            .end((error, response) => {
                try {
                    if (error) {
                        res.end(error);
                    } else {
                        res.end(response.text);
                    }
                } catch (error2) {
                    res.end('\nAn error has occurred while trying to manage the image(s).');
                }
            });
    }
});

app.get('/hb', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .get(`${scheme}${server}:${server_port}/hb`)
            .query({ token: token })
            .end((error, response) => {
                if (!error || response.text) {
                    display_log(data => {
                        res.end(response.text);
                    });
                } else {
                    res.end('\nError connecting with server.');
                }
            });
    }
});

app.get('/log', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        superagent
            .get(`${scheme}${server}:${server_port}/log`)
            .query({ token: check_token })
            .end((error, response) => {
                if (!error || !response.text) {
                    res.end(response.text);
                } else {
                    res.end('\nError connecting with server.');
                }
            });
    }
});

app.get('/nodes', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        res.json(nodedata);
    }
});

app.get('/getconfig', (req, res) => {
    const check_token = req.query.token;

    if ((check_token !== token) || (!check_token)) {
        res.end('\nError: Invalid Credentials');
    } else {
        const options = {
            url: `${scheme}${server}:${server_port}/getconfig?token=${token}`,
            rejectUnauthorized: ssl_self_signed
        };
        superagent
            .get(`${scheme}${server}:${server_port}/getconfig`)
            .query({ token: check_token })
            .end((error, response) => {
                try {
                    if (!error || response.text) {
                        res.end(response.text);
                    } else {
                        res.end('Error connecting with server. ' + error);
                    }
                } catch (error) {}
            });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/index.html'));
});
app.get('/blank.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/blank.html'));
});
app.get('/nodes-list.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/nodes-list.html'));
});
app.get('/containers-layout.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/containers-layout.html'));
});
app.get('/images-prune.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/images-prune.html'));
});
app.get('/functions-clear.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/functions-clear.html'));
});
app.get('/functions-viewer.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/functions-viewer.html'));
});
app.get('/functions-create.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/functions-create.html'));
});
app.get('/functions-current.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/functions-current.html'));
});
app.get('/config-reload.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/config-reload.html'));
});
app.get('/images-pull.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/images-pull.html'));
});
app.get('/images-manage.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/images-manage.html'));
});
app.get('/swarm.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/swarm.html'));
});
app.get('/images-layout.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/images-layout.html'));
});
app.get('/log.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/log.html'));
});
app.get('/heartbeat.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/heartbeat.html'));
});
app.get('/syslog.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/syslog.html'));
});
app.get('/containers-manage.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/containers-manage.html'));
});
app.get('/terminal.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/terminal.html'));
});
app.get('/containers-add.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/containers-add.html'));
});
app.get('/nodes-add.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/nodes-add.html'));
});
app.get('/nodes-remove.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/nodes-remove.html'));
});
app.get('/nodes-manage.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/nodes-manage.html'));
});
app.get('/elasticsearch.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/elasticsearch.html'));
});
app.get('/rsyslog.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/rsyslog.html'));
});
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, '/favicon.ico'));
});
app.get('/docs.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/docs.html'));
});
app.get('/images-upload.html', (req, res) => {
    res.sendFile(path.join(__dirname, '/images-upload.html'));
});

app.get('/logo.png', (req, res) => {
    res.sendFile(logo_slug);
});

// Removing for now serve_doc_pages();

if (config.ssl && config.ssl_cert && config.ssl_key) {
    console.log('SSL Web Console enabled');
    const ssl_options = {
        cert: fs.readFileSync(config.ssl_cert),
        key: fs.readFileSync(config.ssl_key)
    };
    const webconsole = https.createServer(ssl_options, app);
    webconsole.listen(web_port, () => {
        console.log('Listening on port %d', web_port);
    });
} else {
    console.log('Non-SSL Web Console enabled');
    const webconsole = http.createServer(app);
    webconsole.listen(web_port, () => {
        console.log('Listening on port %d', web_port);
    });
}