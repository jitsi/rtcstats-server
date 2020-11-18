#!/bin/bash
set -e

SHOULD_PUSH_IMAGE=$1

if [[ -z "$SHOULD_PUSH_IMAGE" ]]; then
  echo "No instruction to push or not to push specified, exiting."
  echo "please use: ./deploy.sh true/false dev/prod version"
  exit 1
fi

VERSION=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g' \
  | tr -d '[[:space:]]')

REPOSITORY=103425057857.dkr.ecr.us-west-2.amazonaws.com/jitsi-vo/rtcstats-server:rtcstats-server-${VERSION}

docker build -t $REPOSITORY .

if [[ ${SHOULD_PUSH_IMAGE} == true ]]
  then
    echo "push docker image to ecr"
    $(aws ecr get-login --region us-west-2 --no-include-email)
    docker push $REPOSITORY
fi
