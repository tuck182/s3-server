FROM quay.io/signalfuse/maestro-base:14.04-0.1.8.1

MAINTAINER Ozan Turgut <ozan@signalfuse.com>

ENV DEBIAN_FRONTEND noninteractive

WORKDIR /opt/s3-server/

# Install node
RUN apt-get update
RUN apt-get -y install nodejs nodejs-legacy npm

# Install s3-server
RUN npm install -g s3-server

# Run s3-server (assumes env params passed in)
CMD s3-server