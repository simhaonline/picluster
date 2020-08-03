# Container Load Balancer

This feature will automatically configure a Nginx container called ```picluster_lb``` to serve as a loadblanacer to the actual container. The picluster_lb container can only run on the same node as the PiCluster server. After everything is configured, the PiCluster server will automatically configure the Nginx loadbalancer each time it starts.

## Overview of the process.

In the docker folder in the root of the picluster folder, there is folder called picluster_lb. Build and run the container and then configure the loadbalancer in the conatiner.

## Prerequisites

1. Build the picluste_lb container from the docker folder in the root of the PiCluster directory

```
cd /root/picluster/docker/picluster_lb
docker build -t picluster_lb .
```

2. The load balancer must be enabled in the config.json file by adding the following:

  ```
  "loadbalancer": [],
  ```

  ### Add and Run the PiCluster Load Balancer container 

3. In the PiCluster Web Console, click on ```Containers``` -> ```Manage```  followed by Add.

4. Configure it as shown below:

```
Name: picluster_lb
Args: --net=host
Deploy on: <--- Choose the node running the PiCluster Server
```
Do not configure anything in the Options section. 

Click ```Submit``` and the container should be up and running shortly

## Modyifying a Container to Add a Load Balancer 

5. Choose an existing container by clicking on ```Containers``` -> ```Manage```. Click on ```Modify``` and select a container from the dropdown. Click on ```Configure Loadbalancer```. 

6. Choose the nodes for the container loadbalancer.

7. Enter the ports for ```Service Port``` and ```Container Port```