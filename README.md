# PiCluster

![Pic](http://i.imgur.com/WBnXC2R.png)

 PiCluster is a simple way to manage Docker containers on multiple hosts. I created this because I found Docker Swarm not that good and Kubernetes was too difficult to install currently on ARM. PiCluster will only build and run images from Dockerfile's on the host specified in the config file. This software will work on regular x86 hardware also and is not tied to ARM.



[![Build Status](https://travis-ci.org/picluster/picluster.svg?branch=master)](https://travis-ci.org/picluster/picluster) [![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](http://www.gnu.org/licenses/gpl-3.0)

![Pic](https://i.imgur.com/rzhS362.png)

## Features

- Move containers to different hosts in the cluster
- Container Load Balancer
- Run commands in parallel across Nodes
- Heartbeat for services
- Easily build and orchestrate Docker images across nodes
- Web interface
- CLI interface
- Monitor host metrics (Disk, CPU, Memory)
- HTTP interface
- Virtual Networking via Swarm
- Virtual IP Manager
- Rsyslog Analytics
- Built-in web terminal to easily run commands on nodes
- Integrate the Kibana dashboard into PiCluster
- Integrates with Elasticsearch to store the PiCluster logs and host monitoring metrics .
- Automatic container failover to different nodes
- Pull container images from a registry
- Upload Dockerfile archives to the entire cluster
- Functions-as-a-Service (FaaS)

## Prerequisites

- Docker
- Node.js
- OpenSSL
- pq
- git
- curl

### Ubuntu
```
apt-get install openssl git node docker pq curl
```

### Arch Linux
```
pacman -S openssl git node docker pq curl
```

## Cloning this Repository

```
git clone https://github.com/picluster/picluster.git picluster
```

To clone the developer branch (not recommended unless you know what you're doing):

```
git clone -b dev https://github.com/picluster/picluster.git picluster
```

## Config file reference
[See Wiki](https://github.com/picluster/picluster/wiki/Config-Reference)

## Try PiCluster in Docker

We included a compose file to evaluate PiCluster easily on your laptop. Simply Install Docker on your laptop and do the following:

```
cd picluster
docker-compose up -d
```

Finally, in your web browser go to <http://127.0.0.1:3003>

## Installation
[See Wiki](https://github.com/picluster/picluster/wiki/Installation)

## Container Load Balancer 
[See Wiki](https://github.com/picluster/picluster/wiki/CoLoadbalancer)

## Upgrading

[See Wiki](https://github.com/picluster/picluster/wiki/Upgrading)

## Functions-as-a-Service (FAAS)
[See Wiki](https://github.com/picluster/picluster/wiki/Functions-as-a-Service-(FaaS))
<br>

## Configuring and using the command-line client "pictl"

[See Wiki](https://github.com/picluster/picluster/wiki/Pictl)

## SSL/TLS

[See Wiki](https://github.com/picluster/picluster/wiki/SSL-Configuration)

## Using pm2 to init PiCluster on systemd

[See Wiki](https://github.com/picluster/picluster/wiki/PM2)

## Automatic Container failover to other hosts

[See Wiki](https://github.com/picluster/picluster/wiki/Automatic-Container-failover-to-other-hosts)

# Authors and Contributions

* Project created by Phillip Tribble.

* [TokinRing](https://github.com/TokinRing), core developer.

* [AidanHarris](https://github.com/aidanharris), core developer.

* PiCluster Logos by chzbacon.

## Images

This work, "Raspy Whale", is a derivative of "raspberry" by Chanut is Industries from the Noun Project used under CC BY, "Sperm Whale" by Oksana Latysheva from the Noun Project used under CC BY, and "Sperm Whale" by Oksana Latysheva from the Noun Project used under CC BY. "Raspy Whale" is licensed under CC BY by Jordan Sinn.
