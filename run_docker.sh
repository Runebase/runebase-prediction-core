#!/usr/bin/env bash

# confirm docker daemon is running and connected
docker version

# build the image based on the Dockerfile and name it `nvm`
docker build -t runebaseprediction_core .

# confirm image is present
docker images

# enter container terminal
docker run -it runebaseprediction_core bash
